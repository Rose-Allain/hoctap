const express = require('express');
const { createCheckout } = require('../controllers/checkoutController');

const router = express.Router();

router.post('/', createCheckout);

module.exports = router;
