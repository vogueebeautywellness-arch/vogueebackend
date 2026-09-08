


// const crypto = require('crypto');
// const db = require('../../config/db');

// const hashRefreshToken = (refreshToken) => {
//     if (!refreshToken) return null;
//     return crypto.createHash('sha256').update(String(refreshToken)).digest('hex');
// };

// class PartnerAuthModel {
//     static async ensureTable() {
//         const query = `
//       CREATE TABLE IF NOT EXISTS partners (
//         id INT AUTO_INCREMENT PRIMARY KEY,
//                 mobile VARCHAR(20) NOT NULL,
//         country_code VARCHAR(6) DEFAULT '+91',
//         name VARCHAR(100) DEFAULT NULL,
//         rating DECIMAL(3,2) DEFAULT NULL,
//         experience VARCHAR(60) DEFAULT NULL,
//         avatar TEXT DEFAULT NULL,
//         kyc_status VARCHAR(20) DEFAULT 'pending',
//         status VARCHAR(20) DEFAULT 'active',
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//       )
//     `;

//         await db.query(query);

//         // Allow re-registration with the same mobile after soft delete.
//         try {
//             const [indexes] = await db.query("SHOW INDEX FROM partners WHERE Column_name = 'mobile'");
//             for (const index of indexes || []) {
//                 if (Number(index?.Non_unique) === 0 && index?.Key_name) {
//                     try {
//                         await db.query(`ALTER TABLE partners DROP INDEX ${index.Key_name}`);
//                     } catch (_) {
//                         // ignore
//                     }
//                 }
//             }
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query('CREATE INDEX idx_partners_mobile ON partners (mobile)');
//         } catch (_) {
//             // ignore
//         }

//         // Forward-compatible migrations (ignore if column exists)
//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN name VARCHAR(100) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN rating DECIMAL(3,2) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN experience VARCHAR(60) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN avatar TEXT DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN kyc_status VARCHAR(20) DEFAULT 'pending'");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query(
//                 "ALTER TABLE partners ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
//             );
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE partners DROP COLUMN fcm_token");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN expo_push_token VARCHAR(255) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         // UPI verification columns
//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN upi_id VARCHAR(100) DEFAULT NULL");
//         } catch (_) {
//             // ignore - column may already exist
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN upi_verified BOOLEAN DEFAULT false");
//         } catch (_) {
//             // ignore - column may already exist
//         }

//         try {
//             await db.query("ALTER TABLE partners ADD COLUMN upi_verified_at DATETIME DEFAULT NULL");
//         } catch (_) {
//             // ignore - column may already exist
//         }

//         const createOtpTableQuery = `
//             CREATE TABLE IF NOT EXISTS partner_otp (
//                 id INT AUTO_INCREMENT PRIMARY KEY,
//                 mobile VARCHAR(20) NOT NULL,
//                 otp VARCHAR(10) NOT NULL,
//                 expires_at TIMESTAMP NOT NULL,
//                 verified BOOLEAN DEFAULT FALSE,
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             )
//         `;
//         await db.query(createOtpTableQuery);

//         const createPartnerSessionsTableQuery = `
//             CREATE TABLE IF NOT EXISTS partner_sessions (
//                 id INT AUTO_INCREMENT PRIMARY KEY,
//                 partner_id INT NOT NULL,
//                 refresh_token_hash VARCHAR(128) NOT NULL,
//                 expires_at TIMESTAMP NOT NULL,
//                 revoked_at TIMESTAMP NULL DEFAULT NULL,
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//                 INDEX idx_partner_sessions_partner_id (partner_id),
//                 INDEX idx_partner_sessions_refresh_hash (refresh_token_hash),
//                 CONSTRAINT fk_partner_sessions_partner FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
//             )
//         `;
//         await db.query(createPartnerSessionsTableQuery);
//     }

//     static async findByMobile(mobile, conn = db) {
//         const [rows] = await conn.query(
//             `
//             SELECT *
//             FROM partners
//             WHERE mobile = ?
//             ORDER BY CASE WHEN LOWER(COALESCE(status, '')) = 'active' THEN 0 ELSE 1 END, created_at DESC, id DESC
//             LIMIT 1
//             `,
//             [mobile]
//         );
//         return rows.length ? rows[0] : null;
//     }

//     static async findById(id, conn = db) {
//         const [rows] = await conn.query(
//             'SELECT id, mobile, country_code, name, rating, experience, avatar, kyc_status, status, upi_id, upi_verified, upi_verified_at, created_at, updated_at FROM partners WHERE id = ? LIMIT 1',
//             [id]
//         );
//         return rows.length ? rows[0] : null;
//     }

//     static async findByIdWithKyc(id, conn = db) {
//         const [rows] = await conn.query(
//             `
//               SELECT
//                 p.id,
//                 p.mobile,
//                 p.country_code,
//                 p.name,
//                 p.rating,
//                 p.experience,
//                 p.avatar,
//                 p.kyc_status,
//                 p.status,
//                 p.upi_id,
//                 p.upi_verified,
//                 p.upi_verified_at,
//                 p.created_at,
//                 p.updated_at,
//                 pk.partner_type,
//                 pk.full_name AS kyc_full_name,
//                 pk.service_area,
//                 pk.service_latitude,
//                 pk.service_longitude,
//                 pk.experience AS kyc_experience,
//                 pk.skills,
//                 pk.salon_name,
//                 pk.salon_address,
//                 pk.salon_latitude,
//                 pk.salon_longitude,
//                 pk.salon_logo,
//                 pk.salon_gallery,
//                 pk.opening_time,
//                 pk.closing_time,
//                 pk.aadhaar_url,
//                 pk.pan_url,
//                 pk.certificate_url,
//                 pk.selfie_url,
//                 pk.kyc_status AS kyc_record_status,
//                 pk.submit_count AS kyc_submit_count,
//                 pk.id AS kyc_id
//               FROM partners p
//               LEFT JOIN partner_kyc pk ON pk.partner_id = p.id
//               WHERE p.id = ?
//               LIMIT 1
//             `,
//             [id]
//         );
//         return rows.length ? rows[0] : null;
//     }

//     static async createPartner({ mobile, countryCode }) {
//         const [result] = await db.query(
//             'INSERT INTO partners (mobile, country_code, kyc_status) VALUES (?, ?, ?)',
//             [mobile, countryCode || '+91', 'pending']
//         );
//         return result.insertId;
//     }

//     // --- OTP Methods ---

//     static async saveOtp(mobile, otp, expiresAt) {
//         const [result] = await db.query(
//             'INSERT INTO partner_otp (mobile, otp, expires_at) VALUES (?, ?, ?)',
//             [mobile, otp, expiresAt]
//         );
//         return result.insertId;
//     }

//     static async findOtp(mobile, otp) {
//         const [rows] = await db.query(
//             'SELECT * FROM partner_otp WHERE mobile = ? AND otp = ? AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
//             [mobile, otp]
//         );
//         return rows.length ? rows[0] : null;
//     }

//     static async markOtpVerified(id) {
//         await db.query('UPDATE partner_otp SET verified = TRUE WHERE id = ?', [id]);
//     }

//     static async invalidateOldOtps(mobile) {
//         await db.query('UPDATE partner_otp SET verified = TRUE WHERE mobile = ? AND verified = FALSE', [mobile]);
//     }

//     static async countRecentOtps(mobile, minutes) {
//         const [rows] = await db.query(
//             'SELECT COUNT(*) as count FROM partner_otp WHERE mobile = ? AND created_at >= NOW() - INTERVAL ? MINUTE',
//             [mobile, minutes]
//         );
//         return rows[0].count;
//     }

//     static async createSession(partnerId, refreshToken) {
//         const tokenHash = hashRefreshToken(refreshToken);
//         if (!tokenHash) return null;

//         const refreshLifetimeMs = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30) * 24 * 60 * 60 * 1000;
//         const expiresAt = new Date(Date.now() + refreshLifetimeMs);
//         const [result] = await db.query(
//             'INSERT INTO partner_sessions (partner_id, refresh_token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
//             [partnerId, tokenHash, expiresAt]
//         );
//         return result.insertId;
//     }

//     static async findSessionForRefreshToken(refreshToken) {
//         const tokenHash = hashRefreshToken(refreshToken);
//         if (!tokenHash) return null;

//         const [rows] = await db.query(
//             'SELECT * FROM partner_sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
//             [tokenHash]
//         );
//         return rows[0] || null;
//     }

//     static async rotateSession(partnerId, oldRefreshToken, nextRefreshToken) {
//         const oldTokenHash = hashRefreshToken(oldRefreshToken);
//         const nextTokenHash = hashRefreshToken(nextRefreshToken);
//         if (!oldTokenHash || !nextTokenHash) return false;

//         const refreshLifetimeMs = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30) * 24 * 60 * 60 * 1000;
//         const expiresAt = new Date(Date.now() + refreshLifetimeMs);

//         const [result] = await db.query(
//             `UPDATE partner_sessions
//              SET refresh_token_hash = ?, expires_at = ?, revoked_at = NULL, updated_at = NOW()
//              WHERE partner_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
//             [nextTokenHash, expiresAt, partnerId, oldTokenHash]
//         );

//         return Number(result.affectedRows || 0) > 0;
//     }

//     static async revokeSessionForUser(partnerId, refreshToken = null) {
//         if (refreshToken) {
//             const tokenHash = hashRefreshToken(refreshToken);
//             await db.query(
//                 'UPDATE partner_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE partner_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL',
//                 [partnerId, tokenHash]
//             );
//             return;
//         }

//         await db.query(
//             'UPDATE partner_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE partner_id = ? AND revoked_at IS NULL',
//             [partnerId]
//         );
//     }

//     static async revokeAllSessionsForUser(partnerId) {
//         await this.revokeSessionForUser(partnerId);
//     }
// }

// module.exports = PartnerAuthModel;


const crypto = require('crypto');
const db = require('../../config/db');

const hashRefreshToken = (refreshToken) => {
    if (!refreshToken) return null;
    return crypto.createHash('sha256').update(String(refreshToken)).digest('hex');
};

class PartnerAuthModel {
    static async ensureTable() {
        const query = `
      CREATE TABLE IF NOT EXISTS partners (
        id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(20) NOT NULL,
        country_code VARCHAR(6) DEFAULT '+91',
        name VARCHAR(100) DEFAULT NULL,
        rating DECIMAL(3,2) DEFAULT NULL,
        experience VARCHAR(60) DEFAULT NULL,
        avatar TEXT DEFAULT NULL,
        kyc_status VARCHAR(20) DEFAULT 'pending',
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;

        await db.query(query);

        // Allow re-registration with the same mobile after soft delete.
        try {
            const [indexes] = await db.query("SHOW INDEX FROM partners WHERE Column_name = 'mobile'");
            for (const index of indexes || []) {
                if (Number(index?.Non_unique) === 0 && index?.Key_name) {
                    try {
                        await db.query(`ALTER TABLE partners DROP INDEX ${index.Key_name}`);
                    } catch (_) {
                        // ignore
                    }
                }
            }
        } catch (_) {
            // ignore
        }

        try {
            await db.query('CREATE INDEX idx_partners_mobile ON partners (mobile)');
        } catch (_) {
            // ignore
        }

        // Forward-compatible migrations (ignore if column exists)
        try {
            await db.query("ALTER TABLE partners ADD COLUMN name VARCHAR(100) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN rating DECIMAL(3,2) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN experience VARCHAR(60) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN avatar TEXT DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN status VARCHAR(20) DEFAULT 'active'");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN kyc_status VARCHAR(20) DEFAULT 'pending'");
        } catch (_) {
            // ignore
        }

        try {
            await db.query(
                "ALTER TABLE partners ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
            );
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE partners DROP COLUMN fcm_token");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN expo_push_token VARCHAR(255) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        // UPI verification columns
        try {
            await db.query("ALTER TABLE partners ADD COLUMN upi_id VARCHAR(100) DEFAULT NULL");
        } catch (_) {
            // ignore - column may already exist
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN upi_verified BOOLEAN DEFAULT false");
        } catch (_) {
            // ignore - column may already exist
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN upi_verified_at DATETIME DEFAULT NULL");
        } catch (_) {
            // ignore - column may already exist
        }

        try {
            await db.query("ALTER TABLE partners ADD COLUMN online_status ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'OFFLINE'");
        } catch (_) {
            // ignore - column may already exist
        }

        const createOtpTableQuery = `
            CREATE TABLE IF NOT EXISTS partner_otp (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(20) NOT NULL,
                otp VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.query(createOtpTableQuery);

        const createPartnerSessionsTableQuery = `
            CREATE TABLE IF NOT EXISTS partner_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                partner_id INT NOT NULL,
                refresh_token_hash VARCHAR(128) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                revoked_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_partner_sessions_partner_id (partner_id),
                INDEX idx_partner_sessions_refresh_hash (refresh_token_hash),
                CONSTRAINT fk_partner_sessions_partner FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
            )
        `;
        await db.query(createPartnerSessionsTableQuery);
    }

    static async findByMobile(mobile, conn = db) {
        const [rows] = await conn.query(
            `
            SELECT *
            FROM partners
            WHERE mobile = ?
            ORDER BY CASE WHEN LOWER(COALESCE(status, '')) = 'active' THEN 0 ELSE 1 END, created_at DESC, id DESC
            LIMIT 1
            `,
            [mobile]
        );
        return rows.length ? rows[0] : null;
    }

    static async findById(id, conn = db) {
        const [rows] = await conn.query(
            "SELECT id, mobile, country_code, name, rating, experience, avatar, kyc_status, status, upi_id, upi_verified, upi_verified_at, COALESCE(online_status, 'OFFLINE') AS online_status, created_at, updated_at FROM partners WHERE id = ? LIMIT 1",
            [id]
        );
        return rows.length ? rows[0] : null;
    }

    static async findByIdWithKyc(id, conn = db) {
        const [rows] = await conn.query(
            `
              SELECT
                p.id,
                p.mobile,
                p.country_code,
                p.name,
                p.rating,
                p.experience,
                p.avatar,
                p.kyc_status,
                p.status,
                p.upi_id,
                p.upi_verified,
                p.upi_verified_at,
                COALESCE(p.online_status, 'OFFLINE') AS online_status,
                p.created_at,
                p.updated_at,
                pk.partner_type,
                pk.full_name AS kyc_full_name,
                pk.service_area,
                pk.service_latitude,
                pk.service_longitude,
                pk.experience AS kyc_experience,
                pk.skills,
                pk.salon_name,
                pk.salon_address,
                pk.salon_latitude,
                pk.salon_longitude,
                pk.salon_logo,
                pk.salon_gallery,
                pk.opening_time,
                pk.closing_time,
                pk.aadhaar_url,
                pk.pan_url,
                pk.certificate_url,
                pk.selfie_url,
                pk.kyc_status AS kyc_record_status,
                pk.submit_count AS kyc_submit_count,
                pk.id AS kyc_id
              FROM partners p
              LEFT JOIN partner_kyc pk ON pk.partner_id = p.id
              WHERE p.id = ?
              LIMIT 1
            `,
            [id]
        );
        return rows.length ? rows[0] : null;
    }

    static async createPartner({ mobile, countryCode }) {
        const [result] = await db.query(
            'INSERT INTO partners (mobile, country_code, kyc_status) VALUES (?, ?, ?)',
            [mobile, countryCode || '+91', 'pending']
        );
        return result.insertId;
    }

    // --- OTP Methods ---

    static async saveOtp(mobile, otp, expiresAt) {
        const [result] = await db.query(
            'INSERT INTO partner_otp (mobile, otp, expires_at) VALUES (?, ?, ?)',
            [mobile, otp, expiresAt]
        );
        return result.insertId;
    }

    static async findOtp(mobile, otp) {
        const [rows] = await db.query(
            'SELECT * FROM partner_otp WHERE mobile = ? AND otp = ? AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
            [mobile, otp]
        );
        return rows.length ? rows[0] : null;
    }

    static async markOtpVerified(id) {
        await db.query('UPDATE partner_otp SET verified = TRUE WHERE id = ?', [id]);
    }

    static async invalidateOldOtps(mobile) {
        await db.query('UPDATE partner_otp SET verified = TRUE WHERE mobile = ? AND verified = FALSE', [mobile]);
    }

    static async countRecentOtps(mobile, minutes) {
        const [rows] = await db.query(
            'SELECT COUNT(*) as count FROM partner_otp WHERE mobile = ? AND created_at >= NOW() - INTERVAL ? MINUTE',
            [mobile, minutes]
        );
        return rows[0].count;
    }

    static async createSession(partnerId, refreshToken) {
        const tokenHash = hashRefreshToken(refreshToken);
        if (!tokenHash) return null;

        const refreshLifetimeMs = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30) * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + refreshLifetimeMs);
        const [result] = await db.query(
            'INSERT INTO partner_sessions (partner_id, refresh_token_hash, expires_at, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
            [partnerId, tokenHash, expiresAt]
        );
        return result.insertId;
    }

    static async findSessionForRefreshToken(refreshToken) {
        const tokenHash = hashRefreshToken(refreshToken);
        if (!tokenHash) return null;

        const [rows] = await db.query(
            'SELECT * FROM partner_sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [tokenHash]
        );
        return rows[0] || null;
    }

    static async rotateSession(partnerId, oldRefreshToken, nextRefreshToken) {
        const oldTokenHash = hashRefreshToken(oldRefreshToken);
        const nextTokenHash = hashRefreshToken(nextRefreshToken);
        if (!oldTokenHash || !nextTokenHash) return false;

        const refreshLifetimeMs = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30) * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + refreshLifetimeMs);

        const [result] = await db.query(
            `UPDATE partner_sessions
             SET refresh_token_hash = ?, expires_at = ?, revoked_at = NULL, updated_at = NOW()
             WHERE partner_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
            [nextTokenHash, expiresAt, partnerId, oldTokenHash]
        );

        return Number(result.affectedRows || 0) > 0;
    }

    static async revokeSessionForUser(partnerId, refreshToken = null) {
        if (refreshToken) {
            const tokenHash = hashRefreshToken(refreshToken);
            await db.query(
                'UPDATE partner_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE partner_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL',
                [partnerId, tokenHash]
            );
            return;
        }

        await db.query(
            'UPDATE partner_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE partner_id = ? AND revoked_at IS NULL',
            [partnerId]
        );
    }

    static async revokeAllSessionsForUser(partnerId, conn = db) {
        await conn.query(
            'UPDATE partner_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE partner_id = ? AND revoked_at IS NULL',
            [partnerId]
        );
    }
}

module.exports = PartnerAuthModel;
