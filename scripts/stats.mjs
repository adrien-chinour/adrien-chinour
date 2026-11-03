// Génère stats-{light,dark}.svg et langs-{light,dark}.svg à partir de l'API GraphQL GitHub.
// Usage : GITHUB_TOKEN=... node scripts/stats.mjs <login>
import { writeFileSync } from "node:fs";

const login = process.argv[2];
const token = process.env.GITHUB_TOKEN;
if (!login || !token) {
  console.error("usage: GITHUB_TOKEN=... node scripts/stats.mjs <login>");
  process.exit(1);
}

const query = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      restrictedContributionsCount
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

const to = new Date();
const from = new Date(to.getTime() - 365 * 24 * 3600 * 1000);
const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login, from: from.toISOString(), to: to.toISOString() } }),
});
const json = await res.json();
if (json.errors) {
  console.error(JSON.stringify(json.errors, null, 2));
  process.exit(1);
}
const u = json.data.user;
const c = u.contributionsCollection;

const stats = [
  ["Commits sur 12 mois", c.totalCommitContributions + c.restrictedContributionsCount],
];

const bytes = new Map();
for (const r of u.repositories.nodes) {
  for (const { size, node } of r.languages.edges) {
    const cur = bytes.get(node.name) ?? { size: 0, color: node.color ?? "#999" };
    cur.size += size;
    bytes.set(node.name, cur);
  }
}
const total = [...bytes.values()].reduce((n, l) => n + l.size, 0);
const langs = [...bytes.entries()]
  .map(([name, l]) => ({ name, color: l.color, pct: (100 * l.size) / total }))
  .sort((a, b) => b.pct - a.pct)
  .slice(0, 6);

const themes = {
  light: { fg: "#1f2328", muted: "#59636e", line: "#d1d9e0" },
  dark: { fg: "#f0f6fc", muted: "#9198a1", line: "#3d444d" },
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const font = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;

function statsSvg(t) {
  const w = 300, rowH = 26, h = 16 + stats.length * rowH;
  const rows = stats
    .map(([label, value], i) => {
      const y = 28 + i * rowH;
      return `<text x="0" y="${y}" ${font} font-size="14" fill="${t.muted}">${esc(label)}</text>
<text x="${w}" y="${y}" ${font} font-size="14" font-weight="600" fill="${t.fg}" text-anchor="end">${esc(value.toLocaleString("fr-FR"))}</text>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${rows}\n</svg>\n`;
}

function langsSvg(t) {
  const w = 300, barH = 10, h = 20 + barH + 14 + Math.ceil(langs.length / 2) * 22;
  let x = 0;
  const bar = langs
    .map((l) => {
      const bw = (w * l.pct) / 100;
      const s = `<rect x="${x.toFixed(1)}" y="12" width="${bw.toFixed(1)}" height="${barH}" fill="${l.color}"/>`;
      x += bw;
      return s;
    })
    .join("\n");
  const legend = langs
    .map((l, i) => {
      const lx = (i % 2) * (w / 2), ly = 12 + barH + 24 + Math.floor(i / 2) * 22;
      return `<circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/>
<text x="${lx + 16}" y="${ly}" ${font} font-size="13" fill="${t.fg}">${esc(l.name)} <tspan fill="${t.muted}">${l.pct.toFixed(1)} %</tspan></text>`;
    })
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect x="0" y="12" width="${w}" height="${barH}" rx="5" fill="${t.line}"/>
<clipPath id="r"><rect x="0" y="12" width="${w}" height="${barH}" rx="5"/></clipPath>
<g clip-path="url(#r)">${bar}</g>
${legend}
</svg>\n`;
}

for (const [name, t] of Object.entries(themes)) {
  writeFileSync(`stats-${name}.svg`, statsSvg(t));
  writeFileSync(`langs-${name}.svg`, langsSvg(t));
}
console.log(stats.map(([k, v]) => `${k}: ${v}`).join(" | "));
console.log(langs.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
