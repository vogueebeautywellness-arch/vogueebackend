const db = require('../../config/db');

class ReviewModel {
    static async ensureTable() {
        const createQuery = `
            CREATE TABLE IF NOT EXISTS reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                booking_id VARCHAR(80) NOT NULL,
                user_id INT NOT NULL,
                user_name VARCHAR(120) DEFAULT NULL,
                partner_id INT NOT NULL,
                partner_name VARCHAR(120) DEFAULT NULL,
                service_name VARCHAR(255) DEFAULT NULL,
                rating TINYINT NOT NULL,
                review_text TEXT DEFAULT NULL,
                status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_booking_id (booking_id),
                KEY idx_user_id (user_id),
                KEY idx_partner_id (partner_id),
                KEY idx_status (status),
                KEY idx_created_at (created_at)
            )
        `;

        await db.query(createQuery);

        // Forward-compatible migrations (ignore if column exists)
        const alterQueries = [
            "ALTER TABLE reviews ADD COLUMN booking_id VARCHAR(80) NOT NULL",
            "ALTER TABLE reviews ADD COLUMN user_id INT NOT NULL",
            "ALTER TABLE reviews ADD COLUMN user_name VARCHAR(120) DEFAULT NULL",
            "ALTER TABLE reviews ADD COLUMN partner_id INT NOT NULL",
            "ALTER TABLE reviews ADD COLUMN partner_name VARCHAR(120) DEFAULT NULL",
            "ALTER TABLE reviews ADD COLUMN service_name VARCHAR(255) DEFAULT NULL",
            "ALTER TABLE reviews ADD COLUMN rating TINYINT NOT NULL",
            "ALTER TABLE reviews ADD COLUMN review_text TEXT DEFAULT NULL",
            "ALTER TABLE reviews ADD COLUMN status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'",
            "ALTER TABLE reviews ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
        ];

        for (const q of alterQueries) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await db.query(q);
            } catch (_) {
                // ignore
            }
        }

        try {
            await db.query('CREATE UNIQUE INDEX uniq_booking_id ON reviews (booking_id)');
        } catch (_) {
            // ignore
        }

        try {
            await db.query('CREATE INDEX idx_user_id ON reviews (user_id)');
        } catch (_) {
            // ignore
        }

        try {
            await db.query('CREATE INDEX idx_partner_id ON reviews (partner_id)');
        } catch (_) {
            // ignore
        }

        try {
            await db.query('CREATE INDEX idx_status ON reviews (status)');
        } catch (_) {
            // ignore
        }

        try {
            await db.query('CREATE INDEX idx_created_at ON reviews (created_at)');
        } catch (_) {
            // ignore
        }
    }

    static async findByBookingId(bookingId) {
        await this.ensureTable();
        const bid = bookingId == null ? '' : String(bookingId).trim();
        if (!bid) return null;

        const [rows] = await db.query('SELECT * FROM reviews WHERE booking_id = ? LIMIT 1', [bid]);
        return rows && rows[0] ? rows[0] : null;
    }

    static async create({
        bookingId,
        userId,
        userName,
        partnerId,
        partnerName,
        serviceName,
        rating,
        reviewText,
    }) {
        await this.ensureTable();

        const bid = bookingId == null ? '' : String(bookingId).trim();
        const uid = Number(userId);
        const pid = Number(partnerId);
        const r = Number(rating);

        const [result] = await db.query(
            `
            INSERT INTO reviews
                (booking_id, user_id, user_name, partner_id, partner_name, service_name, rating, review_text, status, created_at)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
            `,
            [
                bid,
                uid,
                userName || null,
                pid,
                partnerName || null,
                serviceName || null,
                r,
                reviewText || null,
            ]
        );

        return result?.insertId;
    }

    static async listByUser(userId) {
        await this.ensureTable();
        const uid = Number(userId);
        if (!Number.isFinite(uid)) return [];

        const [rows] = await db.query(
            `
            SELECT *
            FROM reviews
            WHERE user_id = ?
            ORDER BY created_at DESC
            `,
            [uid]
        );

        return Array.isArray(rows) ? rows : [];
    }

    static async listApproved({ limit = 20 } = {}) {
        await this.ensureTable();
        const lim = Math.max(1, Math.min(100, Number(limit) || 20));

        const [rows] = await db.query(
            `
            SELECT id, booking_id, user_id, user_name, partner_id, partner_name, service_name, rating, review_text, status, created_at
            FROM reviews
            WHERE status = 'approved'
            ORDER BY created_at DESC
            LIMIT ?
            `,
            [lim]
        );

        return Array.isArray(rows) ? rows : [];
    }

    static async listAll() {
        await this.ensureTable();

        const [rows] = await db.query(
            `
            SELECT *
            FROM reviews
            ORDER BY created_at DESC
            `
        );

        return Array.isArray(rows) ? rows : [];
    }

    static async updateStatus(id, status) {
        await this.ensureTable();
        const rid = Number(id);
        const next = String(status || '').trim();
        if (!Number.isFinite(rid)) return false;
        if (!['pending', 'approved', 'rejected'].includes(next)) return false;

        const [result] = await db.query('UPDATE reviews SET status = ? WHERE id = ?', [next, rid]);
        return Number(result?.affectedRows || 0) > 0;
    }

    static async delete(id) {
        await this.ensureTable();
        const rid = Number(id);
        if (!Number.isFinite(rid) || rid <= 0) return false;

        const [result] = await db.query('DELETE FROM reviews WHERE id = ?', [rid]);
        return Number(result?.affectedRows || 0) > 0;
    }
}

module.exports = ReviewModel;
