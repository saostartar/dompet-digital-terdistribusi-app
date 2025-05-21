import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const UserRegional = sequelize.define('UserRegional', {
        user_id_master: { // Merujuk ke user_id di db_master.users
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
        },
        saldo: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            defaultValue: 0.00,
            validate: {
                min: 0 // Saldo tidak boleh negatif
            }
        },
        last_seen: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        // createdAt dan updatedAt otomatis, kita namai khusus untuk regional
    }, {
        tableName: 'users_regional',
        timestamps: true,
        createdAt: 'created_at_regional',
        updatedAt: 'updated_at_regional',
    });


    return UserRegional;
};
