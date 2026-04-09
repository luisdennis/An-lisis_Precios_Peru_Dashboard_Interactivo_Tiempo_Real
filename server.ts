import express from "express";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import * as XLSX from "xlsx";
import path from "path";
import https from "https";

// Create an agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API routes
  app.get("/api/indices", async (req, res) => {
    try {
      const urls = [
        {
          id: "consumer_lima",
          name: "Índice de Precios al Consumidor - Lima Metropolitana",
          url: "https://m.inei.gob.pe/media/MenuRecursivo/indices_tematicos/01_indice-precios_al_consumidor-lm_mar26.xlsx",
        },
        {
          id: "consumer_national",
          name: "Índice de Precios al Consumidor - Nivel Nacional",
          url: "https://m.inei.gob.pe/media/MenuRecursivo/indices_tematicos/02_indice-precios_al_consumidor-nivel_nacional_mar26.xlsx",
        },
        {
          id: "wholesale_national",
          name: "Índice de Precios al Por Mayor - Nivel Nacional",
          url: "https://m.inei.gob.pe/media/MenuRecursivo/indices_tematicos/03_indice-precios_al_por_mayor-nivel_nacional_mar26.xlsx",
        },
        {
          id: "machinery_lima",
          name: "Índice de Precios de Maquinaria y Equipo - Lima Metropolitana",
          url: "https://m.inei.gob.pe/media/MenuRecursivo/indices_tematicos/04_indice-precios_de_maquinaria_y_equipo-lm_mar26.xlsx",
        },
        {
          id: "construction_lima",
          name: "Índice de Precios de Materiales de Construcción - Lima Metropolitana",
          url: "https://m.inei.gob.pe/media/MenuRecursivo/indices_tematicos/05_indice-precios_de_materiales_de_construccion-lm_mar26.xlsx",
        },
      ];

      const results = await Promise.all(
        urls.map(async (item) => {
          try {
            const response = await axios.get(item.url, {
              responseType: "arraybuffer",
              httpsAgent, // Use the agent here
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.31 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.31",
              },
            });
            const workbook = XLSX.read(response.data, { type: "buffer" });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

            // Try to extract structured data
            let structuredData: any[] = [];
            try {
              const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
              let currentYear = "";
              
              jsonData.forEach((row) => {
                if (!row || row.length < 2) return;
                
                const col0 = String(row[0] || "").trim();
                const col1 = String(row[1] || "").trim();
                
                // Update current year if found
                if (/^\d{4}$/.test(col0)) {
                  currentYear = col0;
                }

                // Check if col1 is a month
                const monthLower = col1.toLowerCase();
                const isMonth = months.some(m => monthLower.startsWith(m));
                
                if (isMonth && currentYear) {
                  const indice = parseFloat(String(row[2]));
                  const mensual = parseFloat(String(row[3]));
                  const acumulado = parseFloat(String(row[4]));
                  const anual = parseFloat(String(row[5]));

                  if (!isNaN(indice)) {
                    structuredData.push({
                      year: currentYear,
                      month: col1,
                      name: `${col1} ${currentYear}`,
                      indice: indice,
                      mensual: isNaN(mensual) ? null : mensual,
                      acumulado: isNaN(acumulado) ? null : acumulado,
                      anual: isNaN(anual) ? null : anual
                    });
                  }
                }
              });
            } catch (e) {
              console.error("Error parsing structured data", e);
            }

            return {
              id: item.id,
              name: item.name,
              data: jsonData,
              chartData: structuredData,
              success: true,
            };
          } catch (err) {
            console.error(`Error fetching ${item.url}:`, err);
            return {
              id: item.id,
              name: item.name,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        })
      );

      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch indices" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
