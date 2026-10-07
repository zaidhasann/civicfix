import { Schema, Types, model, type HydratedDocument } from 'mongoose';

export const complaintCategories = [
  'pothole',
  'streetlight',
  'waste',
  'water',
  'traffic',
  'public-safety',
  'other',
] as const;
export type ComplaintCategory = (typeof complaintCategories)[number];

export const complaintStatuses = [
  'draft',
  'pending_approval',
  'sent',
  'acknowledged',
  'resolved',
  'rejected',
] as const;
export type ComplaintStatus = (typeof complaintStatuses)[number];

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface AiDraft {
  subject: string;
  body: string;
}

export interface ComplaintRecipient {
  department: string;
  email: string;
  ward: string;
  municipality: string;
}

export interface ComplaintStatusHistoryEntry {
  status: ComplaintStatus;
  changedAt: Date;
  note?: string;
}

export interface Complaint {
  reporter?: Types.ObjectId;
  anonymousId?: string;
  photoUrl?: string;
  location: GeoPoint;
  address: string;
  category: ComplaintCategory;
  severity: number;
  description: string;
  aiDraft?: AiDraft;
  finalEmail?: string;
  recipient: ComplaintRecipient;
  status: ComplaintStatus;
  statusHistory: ComplaintStatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export type ComplaintDocument = HydratedDocument<Complaint>;

const geoPointSchema = new Schema<GeoPoint>(
  {
    type: { type: String, enum: ['Point'], required: true, default: 'Point' },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (coordinates: number[]) => coordinates.length === 2,
        message: 'A GeoJSON Point requires exactly two coordinates',
      },
    },
  },
  { _id: false },
);

const aiDraftSchema = new Schema<AiDraft>(
  {
    subject: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const recipientSchema = new Schema<ComplaintRecipient>(
  {
    department: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    ward: { type: String, required: true, trim: true },
    municipality: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const statusHistoryEntrySchema = new Schema<ComplaintStatusHistoryEntry>(
  {
    status: { type: String, enum: complaintStatuses, required: true },
    changedAt: { type: Date, required: true, default: Date.now },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const complaintSchema = new Schema<Complaint>(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    anonymousId: { type: String, trim: true, index: true },
    photoUrl: { type: String, trim: true },
    location: { type: geoPointSchema, required: true },
    address: { type: String, required: true, trim: true },
    category: { type: String, enum: complaintCategories, required: true, index: true },
    severity: { type: Number, required: true, min: 1, max: 5, index: true },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    aiDraft: { type: aiDraftSchema },
    finalEmail: { type: String, trim: true },
    recipient: { type: recipientSchema, required: true },
    status: {
      type: String,
      enum: complaintStatuses,
      required: true,
      default: 'draft',
      index: true,
    },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },
  },
  { timestamps: true },
);

complaintSchema.index({ location: '2dsphere' });
complaintSchema.index({ status: 1, createdAt: -1 });
complaintSchema.index({ category: 1, createdAt: -1 });
complaintSchema.pre('validate', function validateReporter(next) {
  if ((!this.reporter && !this.anonymousId) || (this.reporter && this.anonymousId)) {
    this.invalidate('reporter', 'Provide exactly one reporter or anonymousId');
    this.invalidate('anonymousId', 'Provide exactly one reporter or anonymousId');
  }
  next();
});

export const ComplaintModel = model<Complaint>('Complaint', complaintSchema);
