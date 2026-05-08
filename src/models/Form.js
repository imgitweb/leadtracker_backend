import mongoose from 'mongoose';

const formSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Form name is required'],
      trim: true,
    },
    type:{
      type: String,
      default: 'ContactUs',
    },
  
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Form = mongoose.model('Form', formSchema);
export default Form;
