const db = require('../../config/db');

class ServiceModel {
  static _fkColumnName = null;
  static _fkInfo = null;

  static _resolveFkColumnNameFromSet(columnSet) {
    // Your DB already has `chapter_id` in some environments
    if (columnSet.has('chapter_id')) return 'chapter_id';
    if (columnSet.has('category_id')) return 'category_id';
    return 'category_id';
  }

  static async _getFkColumnName() {
    if (ServiceModel._fkColumnName) return ServiceModel._fkColumnName;

    const schemaName = process.env.DB_NAME;
    if (!schemaName) {
      ServiceModel._fkColumnName = 'category_id';
      return ServiceModel._fkColumnName;
    }

    const [columns] = await db.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'services'
      `,
      [schemaName]
    );

    const columnSet = new Set((columns || []).map((c) => c.COLUMN_NAME));
    ServiceModel._fkColumnName = ServiceModel._resolveFkColumnNameFromSet(columnSet);
    return ServiceModel._fkColumnName;
  }

  static async _getFkInfo() {
    if (ServiceModel._fkInfo) return ServiceModel._fkInfo;

    const schemaName = process.env.DB_NAME;
    if (!schemaName) {
      ServiceModel._fkInfo = {
        fk: 'category_id',
        hasCategoryId: true,
        hasChapterId: false,
      };
      return ServiceModel._fkInfo;
    }

    const [columns] = await db.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'services'
      `,
      [schemaName]
    );

    const columnSet = new Set((columns || []).map((c) => c.COLUMN_NAME));
    const fk = ServiceModel._resolveFkColumnNameFromSet(columnSet);
    ServiceModel._fkInfo = {
      fk,
      hasCategoryId: columnSet.has('category_id'),
      hasChapterId: columnSet.has('chapter_id'),
    };
    return ServiceModel._fkInfo;
  }

  static async ensureTable() {
    const createServicesTableQuery = `
      CREATE TABLE IF NOT EXISTS services (
        id INT AUTO_INCREMENT PRIMARY KEY,
        category_id INT NOT NULL,
        service_name VARCHAR(150) NOT NULL,
        description TEXT NOT NULL,
        mrp DECIMAL(10,2) NOT NULL,
        duration INT NOT NULL,
        variants VARCHAR(255),
        is_mvp TINYINT(1) DEFAULT 0,
        show_seasonal TINYINT(1) DEFAULT 0,
        show_quick TINYINT(1) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    await db.query(createServicesTableQuery);

    const schemaName = process.env.DB_NAME;
    if (!schemaName) return;

    const [columns] = await db.query(
      `
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'services'
      `,
      [schemaName]
    );

    const columnSet = new Set((columns || []).map((c) => c.COLUMN_NAME));
    ServiceModel._fkColumnName = ServiceModel._resolveFkColumnNameFromSet(columnSet);

    const addColumnIfMissing = async (name, ddl) => {
      if (columnSet.has(name)) return;
      await db.query(`ALTER TABLE services ADD COLUMN ${name} ${ddl}`);
      columnSet.add(name);
    };

    // Ensure both possible FK columns exist (to support old/new DBs)
    await addColumnIfMissing('category_id', 'INT NULL');
    await addColumnIfMissing('chapter_id', 'INT NULL');

    // Ensure other columns exist (older tables might be missing them)
    await addColumnIfMissing('service_name', 'VARCHAR(150) NULL');
    await addColumnIfMissing('description', 'TEXT NULL');
    await addColumnIfMissing('base_price', 'DECIMAL(10,2) NULL');
    await addColumnIfMissing('discount_price', 'DECIMAL(10,2) NULL');
    await addColumnIfMissing('is_featured', 'TINYINT(1) DEFAULT 0');
    await addColumnIfMissing('badges', 'TEXT NULL');
    await addColumnIfMissing('rating', 'DECIMAL(3,2) NULL');
    await addColumnIfMissing('reviews', 'INT NULL');
    await addColumnIfMissing('duration', 'INT NULL');
    await addColumnIfMissing('variants', 'VARCHAR(255) NULL');
    await addColumnIfMissing('image_paths', 'TEXT NULL');
    await addColumnIfMissing('banner_image_path', 'VARCHAR(255) NULL');
    await addColumnIfMissing('video_path', 'VARCHAR(255) NULL');
    await addColumnIfMissing('is_mvp', 'TINYINT(1) DEFAULT 0');
    await addColumnIfMissing('show_seasonal', 'TINYINT(1) DEFAULT 0');
    await addColumnIfMissing('show_quick', 'TINYINT(1) DEFAULT 0');
    await addColumnIfMissing('status', "VARCHAR(20) DEFAULT 'Active'");
    await addColumnIfMissing('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    await addColumnIfMissing('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    // Service-wise commission configuration
    await addColumnIfMissing(
      'commission_type',
      "ENUM('percentage','fixed') NOT NULL DEFAULT 'percentage'"
    );
    await addColumnIfMissing('commission_value', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
    await addColumnIfMissing('commission_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');

    // Migrations from very old schemas
    if (columnSet.has('chapter')) {
      // Old schema stored category name in `chapter`
      await db.query(
        `
          UPDATE services s
          JOIN categories c ON c.name = s.chapter
          SET s.category_id = c.id
          WHERE (s.category_id IS NULL OR s.category_id = 0) AND s.chapter IS NOT NULL AND s.chapter <> ''
        `
      );
    }

    if (columnSet.has('serviceName')) {
      await db.query(
        `UPDATE services SET service_name = serviceName WHERE (service_name IS NULL OR service_name = '') AND serviceName IS NOT NULL`
      );
    }

    if (columnSet.has('categoryId')) {
      await db.query(
        `UPDATE services SET category_id = categoryId WHERE (category_id IS NULL OR category_id = 0) AND categoryId IS NOT NULL`
      );
    }

    // Removed showSeasonal logic as per requirements

    if (columnSet.has('showQuick')) {
      await db.query(`UPDATE services SET show_quick = showQuick WHERE showQuick IS NOT NULL`);
    }

    if (columnSet.has('isMVP')) {
      await db.query(`UPDATE services SET is_mvp = isMVP WHERE isMVP IS NOT NULL`);
    }

    // Legacy: if a single `images` column exists, keep it as a one-item JSON array
    if (columnSet.has('images') && columnSet.has('image_paths')) {
      await db.query(
        `UPDATE services SET image_paths = JSON_ARRAY(images) WHERE (image_paths IS NULL OR image_paths = '') AND images IS NOT NULL AND images <> ''`
      ).catch(() => {
        // If JSON_ARRAY isn't supported, best-effort string format
      });
    }

    // Keep FK columns in sync when both exist
    if (columnSet.has('chapter_id') && columnSet.has('category_id')) {
      await db.query(
        `UPDATE services SET chapter_id = category_id WHERE (chapter_id IS NULL OR chapter_id = 0) AND category_id IS NOT NULL AND category_id <> 0`
      );
      await db.query(
        `UPDATE services SET category_id = chapter_id WHERE (category_id IS NULL OR category_id = 0) AND chapter_id IS NOT NULL AND chapter_id <> 0`
      );
    }

    // Refresh FK cache after potential migrations
    ServiceModel._fkColumnName = ServiceModel._resolveFkColumnNameFromSet(columnSet);
    ServiceModel._fkInfo = null;
  }

  static async getAll() {
    const fk = await ServiceModel._getFkColumnName();
    const [rows] = await db.query(
      `
        SELECT 
          s.id,
          s.${fk} AS category_id,
          c.name AS category_name,
          s.service_name,
          s.description,
          s.base_price,
          s.discount_price,
          s.commission_type,
          s.commission_value,
          s.commission_enabled,
          s.duration,
          s.variants,
          s.image_paths,
          s.banner_image_path,
          s.video_path,
          s.is_mvp,
          s.is_featured,
          s.badges,
          /* s.show_seasonal, */
          s.show_quick,
          s.rating,
          s.reviews,
          s.status,
          s.created_at,
          s.updated_at
        FROM services s
        LEFT JOIN categories c ON c.id = s.${fk}
        ORDER BY s.id DESC
      `
    );
    return rows;
  }

  static async getById(id) {
    const fk = await ServiceModel._getFkColumnName();
    const [rows] = await db.query(
      `
        SELECT 
          s.id,
          s.${fk} AS category_id,
          c.name AS category_name,
          s.service_name,
          s.description,
          s.base_price,
          s.discount_price,
          s.commission_type,
          s.commission_value,
          s.commission_enabled,
          s.duration,
          s.variants,
          s.image_paths,
          s.banner_image_path,
          s.video_path,
          s.is_mvp,
          s.is_featured,
          s.badges,
          /* s.show_seasonal, */
          s.show_quick,
          s.rating,
          s.reviews,
          s.status,
          s.created_at,
          s.updated_at
        FROM services s
        LEFT JOIN categories c ON c.id = s.${fk}
        WHERE s.id = ?
        LIMIT 1
      `,
      [id]
    );
    return rows.length ? rows[0] : null;
  }

  static async create(payload) {
    const {
      categoryId,
      serviceName,
      description,
      basePrice,
      discountPrice,
      commissionType,
      commissionValue,
      commissionEnabled,
      duration,
      variants,
      isMVP,
      isFeatured,
      badges,
      showQuick,
      rating,
      reviews,
      status
    } = payload;

    const normalizedCategoryId =
      typeof categoryId !== 'undefined'
        ? categoryId
        : (typeof payload?.category_id !== 'undefined'
          ? payload.category_id
          : payload?.chapter_id);

    // Support variants as array or string
    const variantsStr = Array.isArray(variants) ? variants.filter(Boolean).join(',') : (variants || null);

    const imagePaths = Array.isArray(payload.imagePaths) ? payload.imagePaths.filter(Boolean) : [];
    const bannerImagePath = payload.bannerImagePath || null;
    const videoPath = payload.videoPath || null;

    const fkInfo = await ServiceModel._getFkInfo();
    const fk = fkInfo.fk;

    const badgesStr = typeof badges === 'string' ? badges : JSON.stringify(badges || []);
    const basePriceNum = Number(basePrice);
    const discountPriceNum = discountPrice === '' || discountPrice === null || typeof discountPrice === 'undefined'
      ? null
      : Number(discountPrice);
    const ratingNum = rating === '' || rating === null || typeof rating === 'undefined' ? null : Number(rating);
    const reviewsNum = reviews === '' || reviews === null || typeof reviews === 'undefined' ? null : Number(reviews);

    const ct = String(commissionType || 'percentage').toLowerCase();
    const commission_type = ct === 'fixed' ? 'fixed' : 'percentage';
    const cv = commissionValue === '' || commissionValue === null || typeof commissionValue === 'undefined'
      ? 0
      : Number(commissionValue);
    const commission_value = Number.isFinite(cv) && cv >= 0 ? cv : 0;

    const commission_enabled = commissionEnabled === false || commissionEnabled === 0 || commissionEnabled === '0' ? 0 : 1;

    // Keep legacy `mrp` in sync with base price (older DBs have mrp NOT NULL)
    const fkColumns = [];
    const fkValues = [];
    // If both columns exist, write both so NOT NULL constraints are always satisfied.
    if (fkInfo.hasCategoryId) {
      fkColumns.push('category_id');
      fkValues.push(normalizedCategoryId);
    }
    if (fkInfo.hasChapterId) {
      fkColumns.push('chapter_id');
      fkValues.push(normalizedCategoryId);
    }
    // Fallback: write whichever fk resolver picked.
    if (fkColumns.length === 0) {
      fkColumns.push(fk);
      fkValues.push(normalizedCategoryId);
    }

    const [result] = await db.query(
      `
        INSERT INTO services
          (${fkColumns.join(', ')}, service_name, description, mrp, base_price, discount_price, commission_type, commission_value, commission_enabled, duration, variants, image_paths, banner_image_path, video_path, is_mvp, is_featured, badges, show_quick, rating, reviews, status)
        VALUES (${fkColumns.map(() => '?').join(', ')}, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        ...fkValues,
        serviceName,
        description,
        basePriceNum,
        basePriceNum,
        discountPriceNum,
        commission_type,
        commission_value,
        commission_enabled,
        Number(duration),
        variantsStr,
        JSON.stringify(imagePaths),
        bannerImagePath,
        videoPath,
        isMVP ? 1 : 0,
        isFeatured ? 1 : 0,
        badgesStr,
        showQuick ? 1 : 0,
        ratingNum,
        reviewsNum,
        status
      ]
    );

    return await ServiceModel.getById(result.insertId);
  }

  static async update(id, payload) {
    const {
      categoryId,
      serviceName,
      description,
      basePrice,
      discountPrice,
      commissionType,
      commissionValue,
      commissionEnabled,
      duration,
      variants,
      isMVP,
      isFeatured,
      badges,
      showQuick,
      rating,
      reviews,
      status
    } = payload;

    const normalizedCategoryId =
      typeof categoryId !== 'undefined'
        ? categoryId
        : (typeof payload?.category_id !== 'undefined'
          ? payload.category_id
          : payload?.chapter_id);

    // Support variants as array or string
    const variantsStr = Array.isArray(variants) ? variants.filter(Boolean).join(',') : (variants || null);

    const imagePaths = Array.isArray(payload.imagePaths) ? payload.imagePaths.filter(Boolean) : [];
    const bannerImagePath = payload.bannerImagePath || null;
    const videoPath = payload.videoPath || null;

    const fkInfo = await ServiceModel._getFkInfo();
    const fk = fkInfo.fk;

    const badgesStr = typeof badges === 'string' ? badges : JSON.stringify(badges || []);
    const basePriceNum = Number(basePrice);
    const discountPriceNum = discountPrice === '' || discountPrice === null || typeof discountPrice === 'undefined'
      ? null
      : Number(discountPrice);
    const ratingNum = rating === '' || rating === null || typeof rating === 'undefined' ? null : Number(rating);
    const reviewsNum = reviews === '' || reviews === null || typeof reviews === 'undefined' ? null : Number(reviews);

    const ct = String(commissionType || 'percentage').toLowerCase();
    const commission_type = ct === 'fixed' ? 'fixed' : 'percentage';
    const cv = commissionValue === '' || commissionValue === null || typeof commissionValue === 'undefined'
      ? 0
      : Number(commissionValue);
    const commission_value = Number.isFinite(cv) && cv >= 0 ? cv : 0;

    const commission_enabled = commissionEnabled === false || commissionEnabled === 0 || commissionEnabled === '0' ? 0 : 1;

    const fkSetClauses = [];
    const fkSetValues = [];

    fkSetClauses.push(`${fk} = ?`);
    fkSetValues.push(normalizedCategoryId);

    if (fkInfo.hasCategoryId && fk !== 'category_id') {
      fkSetClauses.push('category_id = ?');
      fkSetValues.push(normalizedCategoryId);
    }

    if (fkInfo.hasChapterId && fk !== 'chapter_id') {
      fkSetClauses.push('chapter_id = ?');
      fkSetValues.push(normalizedCategoryId);
    }

    await db.query(
      `
        UPDATE services
        SET 
          ${fkSetClauses.join(', ')},
          service_name = ?,
          description = ?,
          mrp = ?,
          base_price = ?,
          discount_price = ?,
          commission_type = ?,
          commission_value = ?,
          commission_enabled = ?,
          duration = ?,
          variants = ?,
          image_paths = ?,
          banner_image_path = ?,
          video_path = ?,
          is_mvp = ?,
          is_featured = ?,
          badges = ?,
          show_quick = ?,
          rating = ?,
          reviews = ?,
          status = ?
        WHERE id = ?
      `,
      [
        ...fkSetValues,
        serviceName,
        description,
        basePriceNum,
        basePriceNum,
        discountPriceNum,
        commission_type,
        commission_value,
        commission_enabled,
        Number(duration),
        variantsStr,
        JSON.stringify(imagePaths),
        bannerImagePath,
        videoPath,
        isMVP ? 1 : 0,
        isFeatured ? 1 : 0,
        badgesStr,
        showQuick ? 1 : 0,
        ratingNum,
        reviewsNum,
        status,
        id
      ]
    );

    return await ServiceModel.getById(id);
  }

  static async updateCommission(id, { commissionType, commissionValue, commissionEnabled }) {
    await ServiceModel.ensureTable();

    const ct = String(commissionType || 'percentage').toLowerCase();
    const commission_type = ct === 'fixed' ? 'fixed' : 'percentage';
    const cv = commissionValue === '' || commissionValue === null || typeof commissionValue === 'undefined'
      ? 0
      : Number(commissionValue);
    const commission_value = Number.isFinite(cv) && cv >= 0 ? cv : 0;
    const commission_enabled = commissionEnabled === false || commissionEnabled === 0 || commissionEnabled === '0' ? 0 : 1;

    await db.query(
      `
        UPDATE services
        SET commission_type = ?, commission_value = ?, commission_enabled = ?
        WHERE id = ?
      `,
      [commission_type, commission_value, commission_enabled, id]
    );

    return await ServiceModel.getById(id);
  }

  static async remove(id) {
    const [result] = await db.query('DELETE FROM services WHERE id = ?', [id]);
    return result.affectedRows;
  }
}

module.exports = ServiceModel;
