import mongoose, { Schema, Document, Model } from 'mongoose'

export type AgeGroup = 'child' | 'teen' | 'adult'

export interface IUser extends Document {
  username: string
  email: string
  passwordHash: string
  emailVerified: boolean
  emailVerifyToken: string | null
  emailVerifyExpires: Date | null
  dateOfBirth: Date
  ageGroup: AgeGroup
  createdAt: Date
  lastLogin: Date
}

export interface IUserModel extends Model<IUser> {
  computeAgeGroup(dob: Date): AgeGroup
}

const UserSchema = new Schema<IUser>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerifyToken: {
      type: String,
      default: null,
    },
    emailVerifyExpires: {
      type: Date,
      default: null,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    ageGroup: {
      type: String,
      enum: ['child', 'teen', 'adult'],
      required: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

/**
 * Compute ageGroup from a date of birth.
 * child  = 7–12
 * teen   = 13–17
 * adult  = 18+
 * Under 7 = registration blocked upstream; we return 'child' as a fallback.
 */
UserSchema.statics.computeAgeGroup = function (dob: Date): AgeGroup {
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const monthDiff = now.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--
  }
  if (age >= 18) return 'adult'
  if (age >= 13) return 'teen'
  return 'child'
}

/** Pre-save: derive ageGroup from dateOfBirth. */
UserSchema.pre('save', function (next) {
  if (this.isModified('dateOfBirth') || this.isNew) {
    const UserModel = this.constructor as IUserModel
    this.ageGroup = UserModel.computeAgeGroup(this.dateOfBirth)
  }
  next()
})

// Never return passwordHash in JSON responses
UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash
    delete ret.emailVerifyToken
    delete ret.emailVerifyExpires
    return ret
  },
})

export const User = mongoose.model<IUser, IUserModel>('User', UserSchema)
