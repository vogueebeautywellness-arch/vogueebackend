

// const db = require('../../config/db');

// class UserAuthModel {
//     static async ensureTable() {
//         const createUsersTableQuery = `
//             CREATE TABLE IF NOT EXISTS users (
//                 id INT AUTO_INCREMENT PRIMARY KEY,
//                 mobile VARCHAR(20) NOT NULL UNIQUE,
//                 country_code VARCHAR(6) DEFAULT '+91',
//                 name VARCHAR(100) DEFAULT NULL,
//                 email VARCHAR(120) DEFAULT NULL,
//                 gender VARCHAR(20) DEFAULT NULL,
//                 city VARCHAR(100) DEFAULT NULL,
//                 avatar VARCHAR(255) DEFAULT NULL,
//                 role VARCHAR(50) DEFAULT 'customer',
//                 status VARCHAR(20) DEFAULT 'active',
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//             )
//         `;

//         await db.query(createUsersTableQuery);

//         // Forward-compatible migrations (ignore if column exists)
//         try {
//             await db.query("ALTER TABLE users ADD COLUMN gender VARCHAR(20) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE users ADD COLUMN city VARCHAR(100) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE users DROP COLUMN fcm_token");
//         } catch (_) {
//             // ignore
//         }

//         try {
//             await db.query("ALTER TABLE users ADD COLUMN expo_push_token VARCHAR(255) DEFAULT NULL");
//         } catch (_) {
//             // ignore
//         }

//         const createOtpTableQuery = `
//             CREATE TABLE IF NOT EXISTS user_otp (
//                 id INT AUTO_INCREMENT PRIMARY KEY,
//                 mobile VARCHAR(20) NOT NULL,
//                 otp VARCHAR(10) NOT NULL,
//                 expires_at TIMESTAMP NOT NULL,
//                 verified BOOLEAN DEFAULT FALSE,
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             )
//         `;
//         await db.query(createOtpTableQuery);
//     }

//     static async findByMobile(mobile) {
//         const [rows] = await db.query('SELECT * FROM users WHERE mobile = ?', [mobile]);
//         return rows.length ? rows[0] : null;
//     }

//     static async findById(id, conn = db) {
//         const [rows] = await conn.query(
//             'SELECT id, mobile, country_code, name, email, gender, city, avatar, role, status, created_at, updated_at FROM users WHERE id = ?',
//             [id]
//         );
//         return rows.length ? rows[0] : null;
//     }

//     static async createUser({ mobile, countryCode }) {
//         const [result] = await db.query(
//             'INSERT INTO users (mobile, country_code, role, status) VALUES (?, ?, ?, ?)',
//             [mobile, countryCode || '+91', 'customer', 'active']
//         );
//         return result.insertId;
//     }

//     static async updateProfile(userId, { name, gender, email, city }) {
//         await db.query(
//             'UPDATE users SET name = ?, gender = ?, email = ?, city = ? WHERE id = ?',
//             [name || null, gender || null, email || null, city || null, userId]
//         );
//     }

//     static async updateAvatar(userId, avatar) {
//         await db.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar || null, userId]);
//     }

//     // --- OTP Methods ---

//     static async saveOtp(mobile, otp, expiresAt) {
//         const [result] = await db.query(
//             'INSERT INTO user_otp (mobile, otp, expires_at) VALUES (?, ?, ?)',
//             [mobile, otp, expiresAt]
//         );
//         return result.insertId;
//     }

//     static async findOtp(mobile, otp) {
//         const [rows] = await db.query(
//             'SELECT * FROM user_otp WHERE mobile = ? AND otp = ? AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
//             [mobile, otp]
//         );
//         return rows.length ? rows[0] : null;
//     }

//     static async markOtpVerified(id) {
//         await db.query('UPDATE user_otp SET verified = TRUE WHERE id = ?', [id]);
//     }

//     static async invalidateOldOtps(mobile) {
//         await db.query('UPDATE user_otp SET verified = TRUE WHERE mobile = ? AND verified = FALSE', [mobile]);
//     }

//     static async countRecentOtps(mobile, minutes) {
//         const [rows] = await db.query(
//             'SELECT COUNT(*) as count FROM user_otp WHERE mobile = ? AND created_at >= NOW() - INTERVAL ? MINUTE',
//             [mobile, minutes]
//         );
//         return rows[0].count;
//     }
// }

// module.exports = UserAuthModel;



const crypto = require('crypto');
const db = require('../../config/db');

const hashRefreshToken = (refreshToken) => {
    if (!refreshToken) return null;
    return crypto.createHash('sha256').update(String(refreshToken)).digest('hex');
};

class UserAuthModel {
    static async ensureTable() {
        const createUsersTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(20) NOT NULL UNIQUE,
                country_code VARCHAR(6) DEFAULT '+91',
                name VARCHAR(100) DEFAULT NULL,
                email VARCHAR(120) DEFAULT NULL,
                gender VARCHAR(20) DEFAULT NULL,
                city VARCHAR(100) DEFAULT NULL,
                avatar VARCHAR(255) DEFAULT NULL,
                role VARCHAR(50) DEFAULT 'customer',
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `;

        await db.query(createUsersTableQuery);

        // Forward-compatible migrations (ignore if column exists)
        try {
            await db.query("ALTER TABLE users ADD COLUMN gender VARCHAR(20) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE users ADD COLUMN city VARCHAR(100) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE users DROP COLUMN fcm_token");
        } catch (_) {
            // ignore
        }

        try {
            await db.query("ALTER TABLE users ADD COLUMN expo_push_token VARCHAR(255) DEFAULT NULL");
        } catch (_) {
            // ignore
        }

        const createOtpTableQuery = `
            CREATE TABLE IF NOT EXISTS user_otp (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(20) NOT NULL,
                otp VARCHAR(10) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.query(createOtpTableQuery);

        const createUserSessionsTableQuery = `
            CREATE TABLE IF NOT EXISTS user_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                refresh_token_hash VARCHAR(128) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                revoked_at TIMESTAMP NULL DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_user_sessions_user_id (user_id),
                INDEX idx_user_sessions_refresh_hash (refresh_token_hash),
                CONSTRAINT fk_user_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `;
        await db.query(createUserSessionsTableQuery);
    }

    static async findByMobile(mobile) {
        const [rows] = await db.query('SELECT * FROM users WHERE mobile = ?', [mobile]);
        return rows.length ? rows[0] : null;
    }

    static async findById(id, conn = db) {
        const [rows] = await conn.query(
            'SELECT id, mobile, country_code, name, email, gender, city, avatar, role, status, created_at, updated_at FROM users WHERE id = ?',
            [id]
        );
        return rows.length ? rows[0] : null;
    }

    static async createUser({ mobile, countryCode }) {
        const [result] = await db.query(
            'INSERT INTO users (mobile, country_code, role, status) VALUES (?, ?, ?, ?)',
            [mobile, countryCode || '+91', 'customer', 'active']
        );
        return result.insertId;
    }

    static async updateProfile(userId, { name, gender, email, city }) {
        await db.query(
            'UPDATE users SET name = ?, gender = ?, email = ?, city = ? WHERE id = ?',
            [name || null, gender || null, email || null, city || null, userId]
        );
    }

    static async updateAvatar(userId, avatar) {
        await db.query('UPDATE users SET avatar = ? WHERE id = ?', [avatar || null, userId]);
    }

    // --- OTP Methods ---

    static async saveOtp(mobile, otp, expiresAt) {
        const [result] = await db.query(
            'INSERT INTO user_otp (mobile, otp, expires_at) VALUES (?, ?, ?)',
            [mobile, otp, expiresAt]
        );
        return result.insertId;
    }

    static async findOtp(mobile, otp) {
        const [rows] = await db.query(
            'SELECT * FROM user_otp WHERE mobile = ? AND otp = ? AND verified = FALSE ORDER BY created_at DESC LIMIT 1',
            [mobile, otp]
        );
        return rows.length ? rows[0] : null;
    }

    static async markOtpVerified(id) {
        await db.query('UPDATE user_otp SET verified = TRUE WHERE id = ?', [id]);
    }

    static async invalidateOldOtps(mobile) {
        await db.query('UPDATE user_otp SET verified = TRUE WHERE mobile = ? AND verified = FALSE', [mobile]);
    }

    static async countRecentOtps(mobile, minutes) {
        const [rows] = await db.query(
            'SELECT COUNT(*) as count FROM user_otp WHERE mobile = ? AND created_at >= NOW() - INTERVAL ? MINUTE',
            [mobile, minutes]
        );
        return rows[0].count;
    }

    static async createSession(userId, refreshToken, sessionMeta = {}) {
        const tokenHash = hashRefreshToken(refreshToken);
        if (!tokenHash) return null;

        const refreshLifetimeMs = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30) * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + refreshLifetimeMs);
        const [result] = await db.query(
            `
            INSERT INTO user_sessions (user_id, refresh_token_hash, expires_at, created_at, updated_at)
            VALUES (?, ?, ?, NOW(), NOW())
            `,
            [userId, tokenHash, expiresAt]
        );

        return result.insertId;
    }

    static async findSessionForRefreshToken(refreshToken) {
        const tokenHash = hashRefreshToken(refreshToken);
        if (!tokenHash) return null;

        const [rows] = await db.query(
            'SELECT * FROM user_sessions WHERE refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
            [tokenHash]
        );
        return rows[0] || null;
    }

    static async rotateSession(userId, oldRefreshToken, nextRefreshToken) {
        const oldTokenHash = hashRefreshToken(oldRefreshToken);
        const nextTokenHash = hashRefreshToken(nextRefreshToken);
        if (!oldTokenHash || !nextTokenHash) return false;

        const refreshLifetimeMs = Number(process.env.JWT_REFRESH_EXPIRES_IN_DAYS || 30) * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(Date.now() + refreshLifetimeMs);

        const [result] = await db.query(
            `UPDATE user_sessions
             SET refresh_token_hash = ?, expires_at = ?, revoked_at = NULL, updated_at = NOW()
             WHERE user_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
            [nextTokenHash, expiresAt, userId, oldTokenHash]
        );

        return Number(result.affectedRows || 0) > 0;
    }

    static async revokeSessionForUser(userId, refreshToken = null, conn = db) {
        if (refreshToken) {
            const tokenHash = hashRefreshToken(refreshToken);
            await conn.query(
                'UPDATE user_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE user_id = ? AND refresh_token_hash = ? AND revoked_at IS NULL',
                [userId, tokenHash]
            );
            return;
        }

        await conn.query(
            'UPDATE user_sessions SET revoked_at = NOW(), updated_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
            [userId]
        );
    }

    static async revokeAllSessionsForUser(userId, conn = db) {
        await this.revokeSessionForUser(userId, null, conn);
    }
}

module.exports = UserAuthModel;
