import jwt from 'jsonwebtoken';
import 'dotenv/config';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN;

if (!JWT_SECRET) {
    console.error("FATAL ERROR: JWT_SECRET tidak didefinisikan di .env");
    process.exit(1);
}

/**
 * Membuat JSON Web Token.
 * @param {object} payload Data yang akan disimpan dalam token (misalnya, user_id, username, region_id).
 * @returns {string} Token JWT.
 */
export const generateToken = (payload) => {
    try {
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        return token;
    } catch (error) {
        console.error('Error saat membuat token JWT:', error);
        throw new Error('Gagal membuat token JWT.');
    }
};

/**
 * Memverifikasi JSON Web Token.
 * @param {string} token Token JWT.
 * @returns {Promise<object|null>} Payload token jika valid, null jika tidak valid atau error.
 */
export const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded; // Mengembalikan payload jika token valid
    } catch (error) {
        // error.name bisa 'TokenExpiredError', 'JsonWebTokenError', dll.
        console.error('Error verifikasi token JWT:', error.name, error.message);
        return null; // Mengembalikan null jika token tidak valid atau error
    }
};
