const db = require('../models');
const StatusColorCRM = db.sequelize.models.StatusColorCRM;


const getAllStatusesCRM = async (req, res) => {
  const list = await StatusColorCRM.findAll({ order: [['id','ASC']] });
  res.json(list);
};
const createStatusesCRM = async (req, res) => {
  const { key, label, color, order } = req.body;
  const status = await StatusColorCRM.create({ key, label, color, order });
  res.status(201).json(status);
};
const updateStatusesCRM = async (req, res) => {
  const status = await StatusColorCRM.findByPk(req.params.id);
  if (!status) return res.status(404).end();
  await status.update(req.body);
  res.json(status);
};
const removeStatusesCRM = async (req, res) => {
  const deleted = await StatusColorCRM.destroy({ where: { id: req.params.id }});
  res.json({ deleted });
};



module.exports = { getAllStatusesCRM, createStatusesCRM, updateStatusesCRM, removeStatusesCRM };