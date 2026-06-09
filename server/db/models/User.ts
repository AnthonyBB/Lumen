import { Schema, model, Document } from 'mongoose'

export type AgeGroup = 'child' | 'teen' | 'adult'

export interface IUser extends Document {
  username: string
  email: string
  passwordHash: string
  emailVerified: boolean
  dateOfBirth?: Date
  ageGroup?: AgeGroup
  createdAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    dateOfBirth: { type: Date },
    /**
     * Age group derived from dateOfBirth or provided at registration.
     *   child : 7–12
     *   teen  : 13–17
     *   adult : 18+
     * Controls which educational question sets are available.
     */
    ageGroup: { type: String, enum: ['child', 'teen', 'adult'] },
  },
  { timestamps: { createdAt: 'createdAt', updatedAt: false } },
)

export const User = model<IUser>('User', UserSchema)
