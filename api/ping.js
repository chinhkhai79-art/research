export default function handler(req, res) {
  return res.status(200).json({
    success: true,
    message: "Research API is working",
    domain: "research.vanthemmo.com"
  });
}
