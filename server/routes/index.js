const { Router } = require('express');

const router = Router();

router.use('/auth', require('./auth'));
router.use('/api', require('./home'));
router.use('/api', require('./editions'));
router.use('/api', require('./votes'));
router.use('/api', require('./map'));
router.use('/api', require('./mapper'));
router.use('/api', require('./mappers'));
router.use('/api', require('./onboarding'));
router.use('/api', require('./admins'));
router.use('/api', require('./links'));
router.use('/api', require('./sync'));
router.use('/api', require('./campaigns'));

module.exports = router;
