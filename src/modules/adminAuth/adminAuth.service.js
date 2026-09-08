const bcrypt = require('bcrypt');
const AdminAuthModel = require('./adminAuth.model');
const { generateToken } = require('../../utils/jwt');

class AdminAuthService {
    static async registerAdmin({ name, email, password }) {
        // Check if admin exists
        const existingAdmin = await AdminAuthModel.findByEmail(email);
        if (existingAdmin) {
            const error = new Error('Email already registered');
            error.statusCode = 400;
            throw error;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Store into DB
        const adminId = await AdminAuthModel.createAdmin({
            name,
            email,
            password: hashedPassword,
            role: 'admin'
        });

        return {
            id: adminId,
            name,
            email,
            role: 'admin'
        };
    }

    static async loginAdmin({ email, password }) {
        const admin = await AdminAuthModel.findByEmail(email);
        if (!admin) {
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        const isMatch = await bcrypt.compare(password, admin.password);
        if (!isMatch) {
            const error = new Error('Invalid email or password');
            error.statusCode = 401;
            throw error;
        }

        // Generate token
        const token = generateToken({ id: admin.id, role: admin.role });

        return {
            admin: {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                role: admin.role
            },
            token
        };
    }

    static async getAdminProfile(adminId) {
        const admin = await AdminAuthModel.findById(adminId);
        if (!admin) {
            const error = new Error('Admin not found');
            error.statusCode = 404;
            throw error;
        }
        return admin;
    }

    static async assertAdminManagementAccess(adminId) {
        const admin = await AdminAuthModel.findById(adminId);
        if (!admin) {
            const error = new Error('Admin not found');
            error.statusCode = 401;
            throw error;
        }

        if (String(admin.role).toLowerCase() !== 'admin') {
            const error = new Error('Only admins can manage other admins');
            error.statusCode = 403;
            throw error;
        }

        return admin;
    }

    static async listAdmins(adminId) {
        await AdminAuthModel.ensureTables();
        await this.assertAdminManagementAccess(adminId);
        return AdminAuthModel.listAdmins();
    }

    static async createAdmin(adminId, data) {
        await AdminAuthModel.ensureTables();
        await this.assertAdminManagementAccess(adminId);

        const existingAdmin = await AdminAuthModel.findByEmail(data.email);
        if (existingAdmin) {
            const error = new Error('Email already registered');
            error.statusCode = 400;
            throw error;
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(data.password, salt);

        try {
            const createdAdminId = await AdminAuthModel.createAdmin({
                name: data.name,
                email: data.email,
                password: hashedPassword,
                role: 'admin'
            });

            return AdminAuthModel.findById(createdAdminId);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                const duplicateError = new Error('Email already registered');
                duplicateError.statusCode = 400;
                throw duplicateError;
            }
            throw error;
        }
    }

    static async deleteAdmin(adminId, targetId) {
        if (!Number.isInteger(targetId) || targetId <= 0) {
            const error = new Error('Invalid admin ID');
            error.statusCode = 400;
            throw error;
        }

        await AdminAuthModel.ensureTables();
        await this.assertAdminManagementAccess(adminId);

        if (Number(adminId) === targetId) {
            const error = new Error('You cannot delete your own admin account');
            error.statusCode = 400;
            throw error;
        }

        const targetAdmin = await AdminAuthModel.findById(targetId);
        if (!targetAdmin) {
            const error = new Error('Admin not found');
            error.statusCode = 404;
            throw error;
        }

        const affectedRows = await AdminAuthModel.deleteAdmin(targetId, targetAdmin.email);
        if (!affectedRows) {
            const error = new Error('Admin not found');
            error.statusCode = 404;
            throw error;
        }

        return { id: targetId };
    }

    static async forgotPassword(email) {
        const admin = await AdminAuthModel.findByEmail(email);
        if (!admin) {
            const error = new Error('No user found with this email');
            error.statusCode = 404;
            throw error;
        }

        // Generate a random token
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        
        // Expiry in 1 hour
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);
        
        // Save token to DB
        await AdminAuthModel.insertResetToken(email, token, expiresAt);

        // Send Email
        const { sendResetEmail } = require('../../utils/email');
        const resetLink = `${process.env.FRONTEND_URL}/admin/secure-portal-r9k-reset-password/${token}`;
        
        try {
            await sendResetEmail(email, resetLink);
        } catch (err) {
            const error = new Error('Email could not be sent. Please configure SMTP properly.');
            error.statusCode = 500;
            throw error;
        }

        return { message: 'Password reset link sent to your email' };
    }

    static async resetPassword(token, newPassword) {
        const tokenRecord = await AdminAuthModel.verifyValidToken(token);
        if (!tokenRecord) {
            const error = new Error('Invalid or expired reset token');
            error.statusCode = 400;
            throw error;
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update database and delete used token
        await AdminAuthModel.updateAdminPassword(tokenRecord.email, hashedPassword);
        await AdminAuthModel.deleteResetToken(tokenRecord.email);

        return { message: 'Password has been successfully reset' };
    }
}

module.exports = AdminAuthService;
