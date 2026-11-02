import CallingPrompt from "../models/CallingPrompt.js";

const DEFAULT_TEMPLATES = [
  {
    _id: "default_lead_outreach",
    title: "Lead Outreach & WhatsApp Info (Hinglish)",
    category: "Sales & Outreach",
    description: "Cold & warm lead follow-up, pitch value, and send details on WhatsApp.",
    systemPrompt:
      "Aap Cinfy Solutions se ek professional, polite aur friendly sales consultant hain. Aap customer se respectful Hinglish/Hindi me baat kar rahe hain. Aap unhe short me batayein ki hum unke business ke liye CRM, WhatsApp automation aur smart lead follow-up provide karte hain. Agar customer interested hai, toh unhe confirm karein aur bole ki poori details WhatsApp par share kar di jayegi. Kabhi robotic fillers jaise 'main samajh gaya' mat dohraiye. Natural human ki tarah baat karein.",
    language: "hi-IN",
    isDefault: true,
  },
  {
    _id: "default_real_estate",
    title: "Real Estate Property Enquiry",
    category: "Real Estate",
    description: "Property requirement qualification, location preference, and budget.",
    systemPrompt:
      "Aap Apex Realty ki taraf se property advisor hain. Aap customer se polite Hinglish me pooch rahe hain ki kya wo 2 BHK ya 3 BHK search kar rahe hain, unka preferred location aur expected budget kya hai. Chhote aur clear answers dein. Kabhi repetitive robotic catchphrases mat use karein.",
    language: "hi-IN",
    isDefault: true,
  },
  {
    _id: "default_demo_booking",
    title: "Product Demo & Appointment Confirmation",
    category: "Appointments",
    description: "Confirming calendar availability for live demo or consultation.",
    systemPrompt:
      "Aap customer se unka scheduled software product demo confirm karne ke liye call kar rahe hain. Poochhein ki kya wo kal 3 PM par 15 minute ke demo ke liye available hain. Agar customer time change chahe toh unka convenient slot note karein aur shukriya bole.",
    language: "hi-IN",
    isDefault: true,
  },
  {
    _id: "default_customer_feedback",
    title: "Customer Feedback & Review",
    category: "Support & Feedback",
    description: "Post-purchase customer satisfaction check and feedback collection.",
    systemPrompt:
      "Aap customer service team se hain. Customer se unka recent purchase aur platform experience 1 minute me rate karne ko kahein. Poochhein kya koi pareshani aayi jisme hum madad kar sakein.",
    language: "hi-IN",
    isDefault: true,
  },
];

/**
 * 1. Get all prompts (Default system templates + company custom prompts)
 */
export const getPrompts = async (req, res) => {
  try {
    const companyId = req.user?.company?._id || req.user?.company;
    const userId = req.user?._id;

    const query = {
      $or: [
        { isDefault: true },
        ...(companyId ? [{ company: companyId }] : []),
        ...(userId ? [{ createdBy: userId }] : []),
      ],
    };

    const customPrompts = await CallingPrompt.find(query).sort({ createdAt: -1 });

    // Combine custom prompts with default starter templates if not already present in DB
    const customTitles = new Set(customPrompts.map((p) => p.title));
    const merged = [
      ...customPrompts,
      ...DEFAULT_TEMPLATES.filter((tmpl) => !customTitles.has(tmpl.title)),
    ];

    return res.status(200).json({
      success: true,
      data: merged,
    });
  } catch (error) {
    console.error("Get Prompts Error:", error);
    return res.status(500).json({ success: false, message: "Failed to fetch prompts", error: error.message });
  }
};

/**
 * 2. Create a new prompt
 */
export const createPrompt = async (req, res) => {
  try {
    const { title, description, systemPrompt, category, language } = req.body;

    if (!title || !systemPrompt) {
      return res.status(400).json({
        success: false,
        message: "Prompt Title and System Prompt instructions are required.",
      });
    }

    const companyId = req.user?.company?._id || req.user?.company;
    const userId = req.user?._id;

    const prompt = await CallingPrompt.create({
      title: title.trim(),
      description: (description || "").trim(),
      systemPrompt: systemPrompt.trim(),
      category: category || "Sales & Outreach",
      language: language || "hi-IN",
      company: companyId || null,
      createdBy: userId || null,
      isDefault: false,
    });

    return res.status(201).json({
      success: true,
      message: "Prompt template created successfully",
      data: prompt,
    });
  } catch (error) {
    console.error("Create Prompt Error:", error);
    return res.status(500).json({ success: false, message: "Failed to create prompt", error: error.message });
  }
};

/**
 * 3. Update an existing prompt
 */
export const updatePrompt = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, systemPrompt, category, language } = req.body;

    // If updating a built-in template that is not in DB yet, create it as custom for this company
    let prompt = null;
    if (id.startsWith("default_")) {
      const companyId = req.user?.company?._id || req.user?.company;
      const userId = req.user?._id;
      prompt = await CallingPrompt.create({
        title: title?.trim() || "Custom Script",
        description: (description || "").trim(),
        systemPrompt: systemPrompt?.trim() || "",
        category: category || "Sales & Outreach",
        language: language || "hi-IN",
        company: companyId || null,
        createdBy: userId || null,
        isDefault: false,
      });

      return res.status(200).json({
        success: true,
        message: "Prompt updated and saved to your library",
        data: prompt,
      });
    }

    prompt = await CallingPrompt.findById(id);
    if (!prompt) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    if (title) prompt.title = title.trim();
    if (description !== undefined) prompt.description = description.trim();
    if (systemPrompt) prompt.systemPrompt = systemPrompt.trim();
    if (category) prompt.category = category;
    if (language) prompt.language = language;

    await prompt.save();

    return res.status(200).json({
      success: true,
      message: "Prompt updated successfully",
      data: prompt,
    });
  } catch (error) {
    console.error("Update Prompt Error:", error);
    return res.status(500).json({ success: false, message: "Failed to update prompt", error: error.message });
  }
};

/**
 * 4. Delete a prompt
 */
export const deletePrompt = async (req, res) => {
  try {
    const { id } = req.params;

    if (id.startsWith("default_")) {
      return res.status(400).json({
        success: false,
        message: "Default system templates cannot be deleted.",
      });
    }

    const deleted = await CallingPrompt.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: "Prompt not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Prompt deleted successfully",
    });
  } catch (error) {
    console.error("Delete Prompt Error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete prompt", error: error.message });
  }
};

export default {
  getPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
};

