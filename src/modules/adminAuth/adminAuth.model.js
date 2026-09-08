const db = require('../../config/db');

class AdminAuthModel {
    static async ensureTables() {
        const createAdminsTableQuery = `
            CREATE TABLE IF NOT EXISTS admins (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.query(createAdminsTableQuery);

        const createResetsTableQuery = `
            CREATE TABLE IF NOT EXISTS password_resets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(100) NOT NULL,
                token VARCHAR(255) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.query(createResetsTableQuery);
    }

    static async createAdmin(adminData) {
        const { name, email, password, role } = adminData;
        const [result] = await db.query(
            'INSERT INTO admins (name, email, password, role) VALUES (?, ?, ?, ?)',
            [name, email, password, role || 'admin']
        );
        return result.insertId;
    }

    static async findByEmail(email) {
        const [rows] = await db.query('SELECT * FROM admins WHERE email = ?', [email]);
        return rows.length ? rows[0] : null;
    }

    static async findById(id) {
        const [rows] = await db.query('SELECT id, name, email, role, created_at FROM admins WHERE id = ?', [id]);
        return rows.length ? rows[0] : null;
    }

    static async listAdmins() {
        const [rows] = await db.query(
            "SELECT id, name, email, role, 'active' AS status, created_at FROM admins ORDER BY created_at DESC, id DESC"
        );
        return rows;
    }

    static async deleteAdmin(id, email) {
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            await connection.query('DELETE FROM password_resets WHERE email = ?', [email]);
            const [result] = await connection.query('DELETE FROM admins WHERE id = ?', [id]);
            await connection.commit();
            return result.affectedRows;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async insertResetToken(email, token, expiresAt) {
        // First delete any existing tokens for this email to prevent spam
        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
        const [result] = await db.query(
            'INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)',
            [email, token, expiresAt]
        );
        return result.insertId;
    }

    static async verifyValidToken(token) {
        const [rows] = await db.query('SELECT * FROM password_resets WHERE token = ? AND expires_at > NOW()', [token]);
        return rows.length ? rows[0] : null;
    }

    static async updateAdminPassword(email, hashedPassword) {
        await db.query('UPDATE admins SET password = ? WHERE email = ?', [hashedPassword, email]);
    }

    static async deleteResetToken(email) {
        await db.query('DELETE FROM password_resets WHERE email = ?', [email]);
    }
}

module.exports = AdminAuthModel;
