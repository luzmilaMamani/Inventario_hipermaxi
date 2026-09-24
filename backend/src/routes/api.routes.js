const express = require('express');
const resources = require('../config/resources');
const { authenticate } = require('../middleware/auth');
const createCrudRouter = require('../utils/crudFactory');
const reportsRouter = require('./reports.routes');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/reportes', authenticate, reportsRouter);

for (const [path, resource] of Object.entries(resources)) {
  router.use(`/${path.replaceAll('_', '-')}`, authenticate, createCrudRouter(resource));
}

module.exports = router;
