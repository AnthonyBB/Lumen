import mongoose, { Schema, Document, Model } from 'mongoose'

export type AgeGroup = 'child' | 'teen' | 'adult'

/**
 * User-chosen content mode.
 * 'child'      — suitable for ages 7-12: safe questions, no mature themes
 * 'adolescent' — suitable for ages 13+: full question library
 * null         — not yet selected; game will prompt on first entry
 */
export type ContentMode = 'child' | 'adolescent' | null

export interface IUser extends Document {
  username: string
  email: string
  passwordHash: string
  emailVerified: boolean
  emailVerifyToken: string | null
  emailVerifyExpires: Date | null
  dateOfBirth: Date
  ageGroup: AgeGroup
  /** User-chosen content preference (overrides computed ageGroup for question filtering). */
  contentMode: ContentMode
  createdAt: Date
  lastLogin: Date
}

export interface IUserModel extends Model<IUser> {
  computeAgeGroup(dob: Date): AgeGroup
}

/**
 * Plain function — compute ageGroup from date of birth.
 * child  = 7–12   (registration blocked under 7 in auth routes)
 * teen   = 13–17
 * adult  = 18+
 */
export function computeAgeGroup(dob: Date): AgeGroup {
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
    contentMode: {
      type: String,
      enum: ['child', 'adolescent', null],
      default: null,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
)

/** Pre-save: derive ageGroup directly from the standalone computeAgeGroup function. */
UserSchema.pre('save', function (next) {
  if (this.isModified('dateOfBirth') || this.isNew) {
    this.ageGroup = computeAgeGroup(this.dateOfBirth)
  }
  next()
})

// Expose as a static too, for any callers that use User.computeAgeGroup()
UserSchema.statics.computeAgeGroup = computeAgeGroup

// Never return sensitive fields in JSON responses
UserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ret as any
    r.passwordHash = undefined
    r.emailVerifyToken = undefined
    r.emailVerifyExpires = undefined
    return r
  },
})

export const User = mongoose.model<IUser, IUserModel>('User', UserSchema)
