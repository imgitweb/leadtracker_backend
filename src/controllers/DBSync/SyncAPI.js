import Lead from "../../models/Lead.js";

export const syncData = async (req, res) => {
  try {
    const companyId = req.user.company._id;

    const { users } = req.body;

    if (!users || !Array.isArray(users)) {
      return res.status(400).json({
        success: false,
        message: "Users array required",
      });
    }

    const operations = users.map((user) => ({
      updateOne: {
        filter: {
          companyId,
          "data.externalUserId": user.externalUserId,
          email: user.email,
        },

        update: {
          $set: {
            companyId,
            name:
              user.name ||
              user.fullName ||
              `${user.firstname} ${user.lastname}` ||
              "",

            email: user.email || "",

            phone: user.phone || user.phone_no || "",

            source: "API",

            updatedAt: new Date(),

            data: {
              ...user,

              syncedAt: new Date(),
            },
          },
        },

        upsert: true,
      },
    }));

    await Lead.bulkWrite(operations);

    return res.status(200).json({
      success: true,
      message: "Users synced successfully",
      totalUsers: users.length,
    });
  } catch (error) {
    console.log("❌ Sync Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
