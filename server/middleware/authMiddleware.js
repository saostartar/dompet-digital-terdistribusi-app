// middleware/authMiddleware.js
import { verifyToken } from '../utils/jwtHelper.js';

/**
 * Middleware untuk memverifikasi token JWT.
 * Jika token valid, req.user akan diisi dengan payload token.
 */
export const protect = async (req, res, next) => {
    let token;

    // Cek apakah ada header Authorization dan dimulai dengan 'Bearer'
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            // Ambil token dari header (Bearer <token>)
            token = req.headers.authorization.split(' ')[1];

            // Verifikasi token
            const decoded = verifyToken(token);

            if (!decoded || !decoded.user_id) {
                return res.status(401).json({ message: 'Tidak terotorisasi, token tidak valid atau payload salah.' });
            }


            // Tambahkan data pengguna (dari token atau dari DB) ke objek request
            req.user = {
                user_id: decoded.user_id,
                username: decoded.username,
                nama_lengkap: decoded.nama_lengkap,
                email: decoded.email,
                region_id: decoded.region_id
            };

            next();
        } catch (error) {
            console.error('Error di middleware proteksi:', error);
            return res.status(401).json({ message: 'Tidak terotorisasi, token gagal diverifikasi.' });
        }
    }

    if (!token) {
        return res.status(401).json({ message: 'Tidak terotorisasi, tidak ada token.' });
    }
};