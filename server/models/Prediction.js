import mongoose from 'mongoose';
const predictionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  student: { name: String, studentId: String, age: Number, gender: String, level: String },
  behaviour: { studytime: Number, absences: Number, failures: Number, activities: String, internet: String, famsup: String, freetime: Number, schoolsup: String, Medu: Number, Fedu: Number },
  category: { type: String, enum: ['Poor','Average','Good','Excellent'], required: true },
  probabilities: [Number], confidence: Number, model: String
}, { timestamps: true });
export default mongoose.models.Prediction || mongoose.model('Prediction', predictionSchema);
