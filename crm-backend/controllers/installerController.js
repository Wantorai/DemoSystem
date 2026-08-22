const db = require('../models');
const Installer = db.sequelize.models.Installer;
const User = db.sequelize.models.User;
const Role = db.sequelize.models.Role;


// Обновление информации о установщике
const updateInstaller = async (req, res) => {
    const { id } = req.params;
    const { phone, color, order, active } = req.body;

    try {
        const installer = await Installer.findByPk(id);
        if (!installer) {
            return res.status(404).json({ error: 'Installer not found' });
        }

        installer.phone = phone ?? installer.phone;
        installer.color = color ?? installer.color;
        installer.order = order ?? installer.order;
        installer.active = (active !== undefined) ? active : installer.active;


        await installer.save();
        res.status(200).json(installer);
    } catch (error) {
        console.error('Error updating installer:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};



// Получение списка всех установщиков
const allInstallers = async (req, res) => {
    try {
        // Admin users with the Installer role are the source of truth. Installer
        // rows only hold schedule-specific settings and a stable schedule id.
        const installerRole = await Role.findOne({ where: { name: 'Установщик' } });
        if (!installerRole) {
            return res.status(200).json([]);
        }

        const users = await User.findAll({
            where: { roleId: installerRole.id },
            attributes: ['id', 'name', 'phone'],
            order: [['name', 'ASC']],
        });

        const installers = await Promise.all(users.map(async (user) => {
            const [installer] = await Installer.findOrCreate({
                where: { userId: user.id },
                defaults: { name: user.name, phone: user.phone, order: 99 },
            });

            // Keep legacy duplicate columns synchronized for older consumers.
            if (installer.name !== user.name || installer.phone !== user.phone) {
                installer.name = user.name;
                installer.phone = user.phone;
                await installer.save();
            }

            return {
                id: installer.id,
                name: user.name,
                phone: user.phone,
                userId: user.id,
                color: installer.color,
                order: installer.order,
                active: installer.active,
            };
        }));

        res.status(200).json(installers);
    } catch (error) {
        console.error('Error fetching installers:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Получить установщика по ID
const getInstallerById = async (req, res) => {
    const { id } = req.params;
    try {
        const installer = await Installer.findByPk(id);
        if (!installer) {
            return res.status(404).json({ error: 'Installer not found' });
        }
        res.status(200).json(installer);
    } catch (error) {
        console.error('Error fetching installer:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = { updateInstaller, allInstallers, getInstallerById };
