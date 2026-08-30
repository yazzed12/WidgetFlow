import { Router } from 'express';
import multer from 'multer';
import { templateImportService } from '../services/templateImportService.js';
import { AppError } from '../middleware/errorHandler.js';

const upload = multer({
  dest: 'server/uploads/temp',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
    if (['docx', 'xlsx', 'xls', 'json'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new AppError('Invalid file type. Only DOCX, XLSX, and JSON files are supported.', 400, 'INVALID_FILE_TYPE'));
    }
  },
});

export const intakeRoutes = Router();

// Analyze Uploaded Document (DOCX / XLSX / JSON)
intakeRoutes.post('/template-import/analyze', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError('Please select a file to import.', 400, 'FILE_MISSING');
    }

    const proposal = await templateImportService.analyzeUploadedFile(req.file);
    res.json({ success: true, data: proposal });
  } catch (err) {
    next(err);
  }
});
