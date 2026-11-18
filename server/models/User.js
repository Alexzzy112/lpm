import mongoose from 'mongoose';
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['student','admin'], default: 'student' },
  studentId: { type: String, trim: true, maxlength: 50 },
  approvalStatus: { type: String, enum: ['pending','approved','rejected'], default: 'approved' }
}, { timestamps: true });
export default mongoose.models.User || mongoose.model('User', userSchema);
