/**
 * POST /api/generate-image
 *
 * Body:
 *   idea        {string}  — tattoo concept description
 *   style       {string}  — e.g. "Traditional", "Realism", "Neo-trad"
 *   placement   {string}  — e.g. "forearm", "chest", "sleeve"
 *   colorMode   {string}  — "black and grey" | "color"
 *   notes       {string}  — optional extra instructions
 *
 * Returns:
 *   { imageUrl: string }  — base64 data URI ready for <img src>
 *
 * Extension points (stubbed, ready to uncomment):
 *   - Lead capture gate       → see step 2 in handler
 *   - Image-to-image editing  → see images.edit() stub in handler
 *   - Reverse image analysis  → add routes/analyzeImage.js
 */

import OpenAI from "openai";

// ── Model config ──────────────────────────────────────────────
// To cut costs, set in .env:  IMAGE_MODEL=gpt-image-1-mini
// Supported values:
//   "gpt-image-1"        full quality (default)
//   "gpt-image-1-mini"   faster, lower cost
const IMAGE_MODEL = process.env.IMAGE_MODEL || "gpt-image-1";

// ── OpenAI client (lazy init) ─────────────────────────────────
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY environment variable is not set.");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

// ── Placement context map ─────────────────────────────────────
const PLACEMENT_CONTEXT = {
  "Forearm":            "designed to wrap naturally around a forearm — vertically oriented, medium detail, readable at arm's length",
  "Upper Arm / Bicep":  "designed for the upper arm and bicep — bold shapes that read well on a curved muscle surface",
  "Sleeve":             "designed as a sleeve component — flows with the arm, elements connect cohesively across a large area",
  "Chest":              "designed for the chest — horizontally balanced, strong centered focal point, room for fine detail",
  "Ribcage":            "designed for the ribcage — vertically elongated, fits between ribs, softer linework suits the area",
  "Back (full)":        "designed as a full back piece — grand large-scale composition, strong center focal point, elaborate detail",
  "Upper Back":         "designed for the upper back between shoulder blades — square composition, bold and centered",
  "Shoulder":           "designed for the shoulder cap — wraps the deltoid, flows naturally from the top of the arm",
  "Neck":               "designed for the neck — compact silhouette, minimal fine detail, very bold readable shapes",
  "Hand / Knuckles":    "designed for the hand — extremely bold, minimal fine lines, high contrast, simple iconic silhouette",
  "Thigh":              "designed for the thigh — large canvas, vertically oriented, can carry high detail and multiple elements",
  "Calf":               "designed for the calf — vertically oriented, bold outline, wraps the muscle slightly",
  "Ankle / Foot":       "designed for the ankle or foot — compact tight composition, clean simple silhouette",
  "Behind Ear":         "designed for behind the ear — very small scale, minimal lines, clean single-element micro design",
  "Other":              "designed as a standalone tattoo piece — balanced composition, clear focal point",
};

// ── Style guide map ───────────────────────────────────────────
const STYLE_GUIDE = {
  "Traditional":           "Bold black outlines, flat color fills, classic American Traditional aesthetic. Simple iconic imagery, no gradients.",
  "Neo-Traditional":       "Bold outlines with more depth than traditional. Rich color palette, decorative flourishes, subtle shading.",
  "Realism":               "Photorealistic precision, three-dimensional shading, looks like a photograph rendered in ink.",
  "Black & Grey Realism":  "Photorealistic without color. Deep shadow work, smooth gradients from black to white, cinematic lighting.",
  "Blackwork":             "Solid black ink only. Bold geometric or illustrative forms. High contrast, no grey wash.",
  "Tribal":                "Bold black tribal patterns. Symmetrical, rhythmic flowing forms. No gradients or color.",
  "Geometric":             "Clean precise lines, geometric shapes, symmetry. Mandalas, polygons, sacred geometry.",
  "Watercolor":            "Soft painterly color washes, minimal black outline structure, dreamy and fluid edges.",
  "Japanese (Irezumi)":    "Traditional Japanese iconography — waves, koi, dragons, cherry blossoms. Bold outlines, flat fills, classic palette.",
  "New School":            "Exaggerated cartoon-like forms, vivid saturated colors, graffiti influence, bold outlines.",
  "Illustrative":          "Detailed pen-and-ink illustration style. Crosshatching, fine lines, narrative composition.",
  "Fine Line":             "Delicate single-needle linework. Minimal shading. Precise, elegant, understated.",
  "Biomechanical":         "Fuses organic flesh with mechanical components. Gears, pistons, cables integrated into the form.",
  "Trash Polka":           "Collage of realism plus graphic red-and-black chaos. Smears, bold imagery, high contrast.",
};

// ── Prompt builder ────────────────────────────────────────────
function buildPrompt({ idea, style, placement, colorMode, notes }) {
  const placementCtx = PLACEMENT_CONTEXT[placement] || PLACEMENT_CONTEXT["Other"];
  const styleDirective = STYLE_GUIDE[style] || `Executed in authentic ${style} tattoo style.`;

  const colorDirective = colorMode === "black and grey"
    ? "Rendered entirely in black and grey — absolutely no color. Rich tonal gradients, smooth shading, deep blacks, clean highlights. Use contrast and depth, avoid flat fill."
    : "Rendered in bold vibrant color with strong ink-like saturation. Color blocking should be clean and tattooable. No muddy or over-blended color.";

  return [
    `Create a high-contrast black and grey tattoo design in a graphic realism style. Subject: ${idea}.`,
    `Style Requirements: Designed specifically for tattooing on skin, not digital illustration. Strong bold blacks with clean separation between light and dark areas. Limited midtones — prioritize contrast and readability. Smooth grey shading, no muddy gradients. Crisp linework and controlled edge transitions. Use intentional negative space for highlights and skin breaks.`,
    `Composition: Centered, balanced, and structured for a tattoo layout. Clear focal point with supporting secondary elements. Background elements simplified and not overpowering the subject. Use framing elements such as ornaments, patterns, halos, or architecture to create depth.`,
    `Detailing: High detail in focal areas such as face, eyes, and main subject. Simplified detail in secondary areas to maintain clarity. No excessive micro-detail that would blur over time.`,
    `Lighting: Dramatic directional lighting from top or side. Strong highlights and deep shadows for dimensionality. Emphasize form through contrast, not color.`,
    `Tattoo Rules: No color. No text. No glowing effects. No blur or painterly softness. Avoid overly thin lines. Must age well on skin.`,
    `The design is ${placementCtx}.`,
    `Output: Clean black and grey tattoo design on a white background only. No skin, no body, no mockup. Professional tattoo flash quality.`,
    notes && notes.trim() ? `Additional artist direction: ${notes.trim()}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// ── Input validation ──────────────────────────────────────────
function validateBody(body) {
  const errors = [];
  if (!body.idea || body.idea.trim().length < 3)
    errors.push("'idea' is required (minimum 3 characters).");
  if (!body.style || !body.style.trim())
    errors.push("'style' is required.");
  if (!body.placement || !body.placement.trim())
    errors.push("'placement' is required.");
  if (!["black and grey", "color"].includes(body.colorMode))
    errors.push("'colorMode' must be 'black and grey' or 'color'.");
  return errors;
}

// ── Route handler ─────────────────────────────────────────────
export async function generateTattooImage(req, res) {
  // 1. Validate input
  const errors = validateBody(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join(" ") });
  }

  // 2. [EXTENSION POINT] Lead capture gate
  //    Require email before allowing generation. Uncomment when ready:
  //
  // if (!req.body.email) {
  //   return res.status(401).json({ error: "Please enter your email to generate." });
  // }
  // await upsertLead({ email: req.body.email, ...req.body });

  // 3. Build prompt
  const prompt = buildPrompt(req.body);

  try {
    const openai = getClient();

    // TEXT-TO-IMAGE
    // gpt-image-1 and gpt-image-1-mini return b64_json natively.
    //
    // [EXTENSION POINT] Image-to-image editing — swap to this when ready:
    //   import fs from "fs";
    //   const response = await openai.images.edit({
    //     model: IMAGE_MODEL,
    //     image: fs.createReadStream(req.file.path),  // requires multer middleware
    //     prompt,
    //     n: 1,
    //     size: "1024x1024",
    //   });

    const response = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: "1024x1792",
    });

    const b64 = response.data[0].b64_json;
    if (!b64) throw new Error("No image data in OpenAI response.");

    return res.json({
      imageUrl: `data:image/png;base64,${b64}`,
      model: IMAGE_MODEL,
      prompt, // remove this line in production if you don't want prompts exposed
    });

  } catch (err) {
    console.error("[generate-image] error:", err?.message || err);
    const status = err?.status || 500;
    const message =
      status === 400 ? "The image request was rejected. Try rephrasing your idea." :
      status === 401 ? "API key issue — contact the studio." :
      status === 429 ? "Generation limit reached. Please wait a moment and try again." :
                       "Image generation failed. Please try again.";
    return res.status(status).json({ error: message });
  }
}
