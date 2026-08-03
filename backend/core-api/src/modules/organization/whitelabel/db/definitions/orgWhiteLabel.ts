import mongoose from 'mongoose';

export const orgWhiteLabelSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: 'ORG_WHITE_LABEL', // 🔒 system-wide singleton
    },

    orgLogo: String,
    orgLoginText: String,
    orgLoginDescription: String,
    orgFavicon: String,
    orgShortDescription: String,
    orgShortName: String,

    /**
     * Accent colour as a hex string, e.g. "#3B90FA".
     *
     * Stored as the operator typed it rather than as oklch: a brand guide
     * quotes hex, and converting on the way in would mean the value read back
     * into the settings form no longer matches what was entered. The browser
     * converts it when applying (core-ui applyRuntimeTheme).
     */
    orgAccentColor: String,

    enabled: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);
