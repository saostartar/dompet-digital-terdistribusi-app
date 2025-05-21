import { db } from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/passwordHelper.js';
import { generateToken } from '../utils/jwtHelper.js';

/**
 * Registrasi pengguna baru.
 */
export const register = async (req, res) => {
    const { username, password, nama_lengkap, email, nomor_telepon, region_id } = req.body;

    // Validasi input sederhana
    if (!username || !password || !nama_lengkap || !email || !nomor_telepon || !region_id) {
        return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Password minimal 6 karakter." });
    }

    const parsedRegionId = parseInt(region_id, 10);
    if (isNaN(parsedRegionId)) {
        return res.status(400).json({ message: "Region ID tidak valid." });
    }

    // Dapatkan instance Sequelize untuk master dan regional
    const { UserMaster, Region } = db.master;
    const regionalModels = db.getRegionalModels(parsedRegionId);

    if (!regionalModels) {
        return res.status(400).json({ message: `Database regional untuk region ID ${parsedRegionId} tidak ditemukan atau tidak dikonfigurasi.` });
    }
    const { UserRegional } = regionalModels;

    // Mulai transaksi di database master untuk memastikan atomicity saat cek dan buat user
    const tMaster = await db.sequelizeMaster.transaction();

    try {
        // 1. Cek apakah username atau email sudah ada di db_master
        const existingUser = await UserMaster.findOne({
            where: {
                [db.Sequelize.Op.or]: [{ username: username }, { email: email }]
            },
            transaction: tMaster
        });

        if (existingUser) {
            await tMaster.rollback(); // Batalkan transaksi jika user sudah ada
            let message = "Pengguna sudah terdaftar.";
            if (existingUser.username === username) {
                message = "Username sudah digunakan.";
            } else if (existingUser.email === email) {
                message = "Email sudah digunakan.";
            }
            return res.status(409).json({ message }); // 409 Conflict
        }

        // 2. Cek apakah region_id valid di db_master.regions
        const regionExists = await Region.findByPk(parsedRegionId, { transaction: tMaster });
        if (!regionExists) {
            await tMaster.rollback();
            return res.status(400).json({ message: `Region ID ${parsedRegionId} tidak valid atau tidak ditemukan.` });
        }

        // 3. Hash password
        const hashedPassword = await hashPassword(password);

        // 4. Buat pengguna baru di db_master.users
        const newUserMaster = await UserMaster.create({
            username,
            password: hashedPassword,
            nama_lengkap,
            email,
            nomor_telepon,
            region_id: parsedRegionId
        }, { transaction: tMaster });

        // Commit transaksi di master SEBELUM mencoba operasi di regional
        // Ini adalah pendekatan di mana master dianggap sumber kebenaran utama untuk info user
        await tMaster.commit();

        // 5. Buat pengguna di db_region_X.users_regional
        try {
            await UserRegional.create({
                user_id_master: newUserMaster.user_id,
                saldo: 0.00, // Saldo awal
                is_active: true
            });
        } catch (regionalError) {
            console.error(`Gagal membuat user regional untuk user_id_master ${newUserMaster.user_id} di region ${parsedRegionId}:`, regionalError);
            return res.status(500).json({
                message: "Registrasi di master berhasil, tetapi gagal membuat data regional. Silakan hubungi admin.",
                userIdMaster: newUserMaster.user_id
            });
        }

        res.status(201).json({
            message: "Registrasi berhasil!",
            user: {
                user_id: newUserMaster.user_id,
                username: newUserMaster.username,
                email: newUserMaster.email,
                region_id: newUserMaster.region_id
            }
        });

    } catch (error) {
        // Jika tMaster belum di-commit atau di-rollback, rollback di sini
        if (tMaster && !tMaster.finished) {
            await tMaster.rollback();
        }
        console.error('Error saat registrasi:', error);
        res.status(500).json({ message: "Terjadi kesalahan pada server saat registrasi." });
    }
};

/**
 * Login pengguna.
 */
export const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username dan password wajib diisi." });
    }

    const { UserMaster } = db.master;

    try {
        // 1. Cari pengguna di db_master.users berdasarkan username
        const userMaster = await UserMaster.findOne({ where: { username } });

        if (!userMaster) {
            return res.status(401).json({ message: "Username atau password salah." }); // Unauthorized
        }

        // 2. Bandingkan password
        const isPasswordMatch = await comparePassword(password, userMaster.password);
        if (!isPasswordMatch) {
            return res.status(401).json({ message: "Username atau password salah." });
        }

        // 3. Jika password cocok, ambil data regional (saldo)
        const regionalModels = db.getRegionalModels(userMaster.region_id);
        if (!regionalModels) {
            console.error(`Database regional untuk region ID ${userMaster.region_id} milik user ${userMaster.username} tidak ditemukan.`);
            return res.status(500).json({ message: "Konfigurasi regional pengguna bermasalah. Hubungi admin." });
        }
        const { UserRegional } = regionalModels;

        const userRegional = await UserRegional.findOne({ where: { user_id_master: userMaster.user_id } });
        if (!userRegional) {
            // Ini seharusnya tidak terjadi jika registrasi berjalan benar
            console.error(`Data regional untuk user_id_master ${userMaster.user_id} tidak ditemukan di region ${userMaster.region_id}.`);
            return res.status(500).json({ message: "Data regional pengguna tidak ditemukan. Hubungi admin." });
        }

        // 4. Buat token JWT
        const payload = {
            user_id: userMaster.user_id,
            username: userMaster.username,
            nama_lengkap: userMaster.nama_lengkap,
            email: userMaster.email,
            region_id: userMaster.region_id,
        };
        const token = generateToken(payload);

        res.status(200).json({
            message: "Login berhasil!",
            token,
            user: {
                ...payload, // Kirim kembali data user yang ada di token
                saldo: userRegional.saldo // Tambahkan saldo
            }
        });

    } catch (error) {
        console.error('Error saat login:', error);
        res.status(500).json({ message: "Terjadi kesalahan pada server saat login." });
    }
};
