import { Schema, model, type HydratedDocument } from 'mongoose';

export const userRoles = ['citizen', 'admin'] as const;
export type UserRole = (typeof userRoles)[number];

export interface User {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: userRoles, default: 'citizen', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const UserModel = model<User>('User', userSchema);
