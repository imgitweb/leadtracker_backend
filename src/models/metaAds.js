import mongoose from "mongoose";

const trackingSpecSchema = new mongoose.Schema(
  {},
  {
    _id: false,
    strict: false,
  },
);

const creativeSchema = new mongoose.Schema(
  {
    creativeId: String,
    name: String,
    status: String,
    thumbnailUrl: String,
    actorId: String,
    body: String,
    assetFeedSpec: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    _id: false,
  },
);

const metaAdSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    adAccountId: {
      type: String,
      required: true,
      index: true,
    },

    campaignId: {
      type: String,
      required: true,
      index: true,
    },

    adSetId: {
      type: String,
      required: true,
      index: true,
    },

    adId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    adName: {
      type: String,
      required: true,
    },

    status: String,

    effectiveStatus: String,

    creative: creativeSchema,

    trackingSpecs: {
      type: [trackingSpecSchema],
      default: [],
    },

    metaData: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

metaAdSchema.index({
  userId: 1,
  campaignId: 1,
});

metaAdSchema.index({
  userId: 1,
  adSetId: 1,
});

export default mongoose.model("MetaAd", metaAdSchema);
