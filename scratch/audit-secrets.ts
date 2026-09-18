import fs from "fs";
import path from "path";

const SECRET_PATTERNS = [
  { name: "Supabase Service Role Key", regex: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/ },
  { name: "Generic JWT Token", regex: /ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/ },
  { name: "PostgreSQL Connection String with Password", regex: /postgres(ql)?:\/\/[^:]+:[^@]+@[^/]+/ },
  { name: "Telegram Bot Token", regex: /[0-9]{9,10}:[a-zA-Z0-9_-]{35}/ },
  { name: "Resend API Key", regex: /re_[a-zA-Z0-9]{20,}/ },
  { name: "Gemini API Key", regex: /AIzaSy[a-zA-Z0-9_-]{33}/ },
  { name: "Upstash Redis Token", regex: /AX[a-zA-Z0-9_\-=]{20,}/ },
  { name: "Generic API Key assignment", regex: /(api_key|apikey|secret|password|token)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/i },
];

const IGNORED_DIRS = ["node_modules", ".git", ".next", "dist", "build", "scratch"];
const IGNORED_FILES = [".env.local", ".env", "package-lock.json"];

interface Finding {
  file: string;
  line: number;
  pattern: string;
  preview: string;
}

const findings: Finding[] = [];

function scanDir(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(process.cwd(), fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.includes(entry.name)) continue;
      scanDir(fullPath);
    } else if (entry.isFile()) {
      if (IGNORED_FILES.includes(entry.name)) continue;
      // only scan code/text files
      if (!/\.(ts|tsx|js|jsx|json|mjs|sql|md|html|css|env\.example)$/.test(entry.name)) continue;

      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const p of SECRET_PATTERNS) {
          if (p.regex.test(line)) {
            // Ignore mock test strings or variable references
            if (
              line.includes("process.env") ||
              line.includes("token_falso") ||
              line.includes("Bearer test") ||
              line.includes("crypto.randomUUID") ||
              line.includes("tu_clave") ||
              line.includes("your-") ||
              line.includes("mock") ||
              line.includes("dummy")
            ) {
              continue;
            }
            findings.push({
              file: relPath,
              line: i + 1,
              pattern: p.name,
              preview: line.trim().slice(0, 100),
            });
          }
        }
      }
    }
  }
}

scanDir(process.cwd());
console.log("Resultados de la auditoría de secretos:");
console.log(`Total de hallazgos sospechosos: ${findings.length}`);
if (findings.length > 0) {
  console.log(JSON.stringify(findings, null, 2));
} else {
  console.log("CERO SECRETOS HARDCODEADOS DETECTADOS EN EL CÓDIGO FUENTE.");
}

