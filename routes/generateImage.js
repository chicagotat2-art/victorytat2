import OpenAI from "openai";

// To switch models, set IMAGE_MODEL in Railway Variables:
//   "dall-e-3"           reliable, works on all accounts (default)
//   "gpt-image-1"        newer, requires approved access
//   "gpt-image-1-mini"   cheaper version of gpt-image-1
const IMAGE_MODEL = process.env.IMAGE_MODEL || "dall-e-3";

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

const PLACEMENT_CONTEXT = {
  "Forearm": "designed to wrap naturally around a forearm — vertically oriented, medium detail, readable at arm's length",
  "Upper Arm / Bicep": "designed for the upper arm and bicep — bold shapes that read well on a curved muscle surface",
  "Sleeve": "designed as a sleeve component — flows with the arm, elements connect cohesively across a large area",
  "Chest": "designed for the chest — horizontally balanced, strong centered focal point, room for fine detail",
  "Ribcage": "designed for the ribcage — vertically elongated, fits between ribs, softer linework suits the area",
  "Back (full)": "designed as a full back piece — grand large-scale composition, strong center focal point, elaborate detail",
  "Upper Back": "designed for the upper back between shoulder blades — square composition, bold and centered",
  "Shoulder": "designed for the shoulder cap — wraps the deltoid, flows naturally from the top of the arm",
  "Neck": "designed for the neck — compact silhouette, minimal fine detail, very bold readable shapes",
  "Hand / Knuckles": "designed for the hand — extremely bold, minimal fine lines, high contrast, simple iconic silhouette",
  "Thigh": "designed for the thigh — large canvas, vertically oriented, can carry high detail and multiple elements",
  "Calf": "designed for the calf — vertically oriented, bold outline, wraps the muscle slightly",
  "Ankle / Foot": "designed for the ankle or foot — compact tight composition, clean simple silhouette",
  "Behind Ear": "designed for behind the ear — very small scale, minimal lines, clean single-element micro design",
  "Other": "designed as a standalone tattoo piece — balanced composition, clear focal point",
};

const STYLE_GUIDE = {
  "Traditional": "Bold black outlines, flat color fills, classic American Traditional aesthetic. Simple iconic imagery, no gradients.",
  "Neo-Traditional": "Bold outlines with more depth than traditional. Rich color palette, decorative flourishes, subtle shading.",
  "Realism": "Photorealistic precision, three-dimensional shading, looks like a photograph rendered in ink.",
  "Black & Grey Realism": "Photorealistic without color. Deep shadow work, smooth gradients from black to white, cinematic lighting.",
  "Blackwork": "Solid black ink only. Bold geometric or illustrative forms. High contrast, no grey wash.",
  "Tribal": "Bold black tribal patterns. Symmetrical, rhythmic flowing forms. No gradients or color.",
  "Geometric": "Clean precise lines, geometric shapes, symmetry. Mandalas, polygons, sacred geometry.",
  "Watercolor": "Soft painterly color washes, minimal black outline structure, dreamy and fluid edges.",
  "Japanese (Irezumi)": "Traditional Japanese iconography — waves, koi, dragons, cherry blossoms. Bold outlines, flat fills, classic palette.",
  "New School": "Exaggerated cartoon-like forms, vivid saturated colors, graffiti influence, bold outlines.",
  "Illustrative": "Detailed pen-and-ink illustration style. Crosshatching, fine lines, narrative composition.",
  "Fine Line": "Delicate single-needle linework. Minimal shading. Precise, elegant, understated.",
  "Biomechanical": "Fuses organic flesh with mechanical components. Gears, pistons, cables integrated into the form.",
  "Trash Polka": "Collage of realism plus graphic red-and-black chaos. Smears, bold imagery, high contrast.",
};

function buildPrompt({ idea, style, placement, colorMode, notes }) {
  const placementCtx = PLACEMENT_CONTEXT[placement] || PLACEMENT_CONTEXT["Other"];
  const styleDirective = STYLE_GUIDE[style] || `Executed in authentic ${style} tattoo style.`;
  const colorDirective = colorMode === "black and grey"
    ? "Rendered entirely in black and grey — absolutely no color. Rich tonal gradients, smooth shading, deep blacks, clean highlights."
    : "Rendered in bold vibrant color with strong ink-like saturation. Color blocking should be clean and tattooable.";
  return [
    `A professional tattoo design concept: ${idea}.`,
    styleDirective,
    `The design is ${placementCtx}.`,
    colorDirective,
    `The design must be tattooable: clean composition, strong readable silhouette, no lines so thin they would blur in skin.`,
    `Present as isolated artwork on a pure white background. No skin, no body, no photo mockup. Just the centered tattoo design.`,
    `High detail. Professional tattoo flash art quality. Studio-ready reference image.`,
    `No text, labels, watermarks, or signatures anywhere in the image.`,
    notes && notes.trim() ? `Additional artist direction: ${notes.trim()}.` : null,
  ].filter(Boolean).join(" ");
}

function validateBody(body) {
  const errors = [];
  if (!body.idea || body.idea.trim().length < 3) errors.push("'idea' is required (minimum 3 characters).");
  if (!body.style || !body.style.trim()) errors.push("'style' is required.");
  if (!body.placement || !body.placement.trim()) errors.push("'placement' is required.");
  if (!["black and grey", "color"].includes(body.colorMode)) errors.push("'colorMode' must be 'black and grey' or 'color'.");
  return errors;
}

export async function generateTattooImage(req, res) {
  const errors = validateBody(req.body);
  if (errors.length) return res.status(400).json({ error: errors.join(" ") });

  const prompt = buildPrompt(req.body);

  try {
    const openai = getClient();
    const isGptImage = IMAGE_MODEL.startsWith("gpt-image");

    const response = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      size: "1024x1024",
      ...(isGptImage ? {} : { response_format: "b64_json" }),
    });

    const item = response.data[0];

    // gpt-image models return b64_json natively
    // dall-e-3 returns b64_json when response_format is set
    if (item.b64_json) {
      return res.json({ imageUrl: `data:image/png;base64,${item.b64_json}`, model: IMAGE_MODEL });
    }
    // fallback: url (dall-e-3 default)
    if (item.url) {
      return res.json({ imageUrl: item.url, model: IMAGE_MODEL });
    }

    throw new Error("No image data in OpenAI response.");

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
