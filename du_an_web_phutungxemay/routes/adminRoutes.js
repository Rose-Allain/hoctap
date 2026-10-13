const express = require('express');
const admin = require('../controllers/adminController');
const requireAdminKey = require('../middleware/adminAuth');

const router = express.Router();

router.use(requireAdminKey);

router.get('/summary', admin.getSummary);
router.get('/lookups', admin.getLookups);
router.get('/catalog/:type', admin.getCatalog);
router.post('/catalog/:type', admin.createCatalog);
router.put('/catalog/:type/:id', admin.updateCatalog);
router.delete('/catalog/:type/:id', admin.archiveCatalog);

router.get('/products', admin.getProducts);
router.post('/products', admin.createProduct);
router.put('/products/:id', admin.updateProduct);
router.delete('/products/:id', admin.archiveProduct);

router.get('/invoices', admin.getInvoices);
router.post('/invoices', admin.createInvoice);
router.get('/invoices/:id', admin.getInvoice);
router.put('/invoices/:id', admin.updateInvoice);
router.delete('/invoices/:id', admin.archiveInvoice);
router.post('/invoices/:id/payments', admin.createPayment);

module.exports = router;
