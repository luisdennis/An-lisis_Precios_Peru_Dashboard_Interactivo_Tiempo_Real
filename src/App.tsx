import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { TrendingUp, FileSpreadsheet, AlertCircle, RefreshCw, ChevronDown, Sparkles, Loader2, Maximize2, BarChart3, BrainCircuit, LayoutGrid, Calculator, BarChart as BarChartIcon } from "lucide-react";

// Holt-Winters Triple Exponential Smoothing (Additive)
function holtWintersAdditive(data: number[], forecastPeriods: number, seasonality: number = 12) {
  if (data.length < seasonality * 2) return [];

  const alpha = 0.4;
  const beta = 0.1;
  const gamma = 0.3;

  // Initial Level
  let level = data.slice(0, seasonality).reduce((a, b) => a + b, 0) / seasonality;
  
  // Initial Trend
  let trend = (data.slice(seasonality, seasonality * 2).reduce((a, b) => a + b, 0) / seasonality - level) / seasonality;

  // Initial Seasonals
  const seasonal = [];
  for (let i = 0; i < seasonality; i++) {
    seasonal.push(data[i] - level);
  }

  // Smooth
  for (let i = 0; i < data.length; i++) {
    const lastLevel = level;
    level = alpha * (data[i] - seasonal[i % seasonality]) + (1 - alpha) * (level + trend);
    trend = beta * (level - lastLevel) + (1 - beta) * trend;
    seasonal[i % seasonality] = gamma * (data[i] - level) + (1 - gamma) * seasonal[i % seasonality];
  }

  // Forecast
  const forecast = [];
  for (let i = 1; i <= forecastPeriods; i++) {
    forecast.push(level + i * trend + seasonal[(data.length + i - 1) % seasonality]);
  }

  return forecast;
}

interface IndexResult {
  id: string;
  name: string;
  data: any[][];
  chartData?: { 
    year: string; 
    month: string; 
    name: string; 
    indice: number; 
    mensual: number | null; 
    acumulado: number | null; 
    anual: number | null; 
  }[];
  success: boolean;
  error?: string;
}

type MetricType = "indice" | "mensual" | "acumulado" | "anual";

// Initialize Gemini API lazily
let aiInstance: GoogleGenAI | null = null;
const getAI = () => {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing");
      return null;
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export default function App() {
  const [indices, setIndices] = useState<IndexResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("indice");
  
  // AI Interpretation state
  const [trendInterpretation, setTrendInterpretation] = useState<string>("");
  const [comparisonInterpretation, setComparisonInterpretation] = useState<string>("");
  const [yearlyInterpretation, setYearlyInterpretation] = useState<string>("");
  const [heatmapInterpretation, setHeatmapInterpretation] = useState<string>("");
  const [cardInterpretation, setCardInterpretation] = useState<string>("");
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  // Local state for the Inflation Calculator Card
  const [cardYear, setCardYear] = useState<string>("");
  const [cardMonth, setCardMonth] = useState<string>("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get("/api/indices");
      if (response.data && Array.isArray(response.data)) {
        setIndices(response.data);
        if (response.data.length > 0) {
          setSelectedId(response.data[0].id);
        }
      } else {
        throw new Error("Formato de datos inválido");
      }
    } catch (err) {
      setError("Error al cargar los datos de INEI.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedIndex = indices.find(idx => idx.id === selectedId);
  
  // Get unique years for the current index
  const availableYears = useMemo(() => {
    if (!selectedIndex?.chartData) return [];
    return Array.from(new Set(selectedIndex.chartData.map(d => d.year))).sort((a, b) => String(b).localeCompare(String(a)));
  }, [selectedIndex]);

  // Filter chart data
  const filteredChartData = useMemo(() => {
    if (!selectedIndex?.chartData) return [];
    const baseData = selectedIndex.chartData.filter(d => 
      selectedYear === "all" ? true : d.year === selectedYear
    );

    // Add predictions if metric is a variation and we have enough data
    if (selectedMetric !== "indice" && baseData.length >= 24) {
      const values = baseData.map(d => d[selectedMetric] as number);
      const forecast = holtWintersAdditive(values, 6); // Predict next 6 months
      
      const lastDate = new Date(baseData[baseData.length - 1].year + "-" + baseData[baseData.length - 1].month + "-01");
      const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      
      const predictionPoints = forecast.map((val, i) => {
        const nextDate = new Date(lastDate);
        nextDate.setMonth(lastDate.getMonth() + i + 1);
        return {
          name: `${months[nextDate.getMonth()]} ${nextDate.getFullYear()}`,
          year: String(nextDate.getFullYear()),
          month: months[nextDate.getMonth()],
          [selectedMetric]: null,
          prediction: val,
          isPrediction: true
        };
      });

      return [...baseData, ...predictionPoints];
    }

    return baseData;
  }, [selectedIndex, selectedYear, selectedMetric]);

  // Comparison Data: Group by month, lines for each year
  const comparisonData = useMemo(() => {
    if (!selectedIndex?.chartData) return [];
    
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const dataByMonth: Record<string, any> = {};
    
    months.forEach(m => {
      dataByMonth[m] = { month: m };
    });

    selectedIndex.chartData.forEach(d => {
      if (!d.month || !d.year) return;
      const monthKey = months.find(m => d.month.toLowerCase().startsWith(m));
      if (monthKey) {
        dataByMonth[monthKey][d.year] = d[selectedMetric];
      }
    });

    return Object.values(dataByMonth);
  }, [selectedIndex, selectedMetric]);

  // Yearly Data: Average per year
  const yearlyData = useMemo(() => {
    if (!selectedIndex?.chartData) return [];
    const years = Array.from(new Set(selectedIndex.chartData.map(d => d.year))).sort();
    return years.map(year => {
      const yearPoints = selectedIndex.chartData!.filter(d => d.year === year);
      const sum = yearPoints.reduce((acc, curr) => acc + (curr[selectedMetric] || 0), 0);
      return {
        year,
        value: sum / yearPoints.length
      };
    });
  }, [selectedIndex, selectedMetric]);

  // Heatmap Data: Matrix of Year x Month (Last 10 years)
  const heatmapData = useMemo(() => {
    if (!selectedIndex?.chartData) return [];
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const years = Array.from(new Set(selectedIndex.chartData.map(d => d.year))).sort().reverse().slice(0, 10);
    
    return years.map(year => {
      const row: any = { year };
      months.forEach(m => {
        const point = selectedIndex.chartData!.find(d => d.year === year && d.month.toLowerCase().startsWith(m));
        row[m] = point ? point[selectedMetric] : null;
      });
      return row;
    });
  }, [selectedIndex, selectedMetric]);

  useEffect(() => {
    if (availableYears.length > 0) {
      if (!cardYear || !availableYears.includes(cardYear)) {
        setCardYear(availableYears[0]);
      }
    }
    if (!cardMonth) {
      setCardMonth("Dic");
    }
  }, [availableYears, cardYear]);

  const cardCalculations = useMemo(() => {
    if (!selectedIndex?.chartData || !cardYear || !cardMonth) return null;

    const data = selectedIndex.chartData;
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const targetMonthKey = cardMonth.toLowerCase().substring(0, 3);
    
    const currentPoint = data.find(d => {
      if (!d.year || !d.month) return false;
      const dMonthKey = d.month.toLowerCase().substring(0, 3);
      return String(d.year) === String(cardYear) && dMonthKey === targetMonthKey;
    });

    if (!currentPoint) return null;

    // 1. Inflación Mensual
    const mensual = currentPoint.mensual;

    // 2. Inflación Acumulada
    const acumulada = currentPoint.acumulado;

    // 3. Inflación Anual
    const anual = currentPoint.anual;

    // 4. Promedio Anual (Average of monthly variations for that year)
    const yearPoints = data.filter(d => String(d.year) === String(cardYear));
    const promedioAnual = yearPoints.length > 0 
      ? yearPoints.reduce((acc, curr) => acc + (curr.mensual || 0), 0) / yearPoints.length 
      : null;

    return { mensual, acumulada, anual, promedioAnual };
  }, [selectedIndex, cardYear, cardMonth]);

  // Local AI Interpretation for the Calculator Card
  useEffect(() => {
    const generateCardInterpretation = async () => {
      if (!cardCalculations || !selectedIndex) {
        setCardInterpretation("Seleccione un periodo con datos.");
        return;
      }
      
      const ai = getAI();
      if (!ai) return;

      try {
        const prompt = `Eres un analista del INEI. Explica de forma muy sencilla y clara para todo el público qué significan estos resultados de inflación para ${selectedIndex.name} en ${cardMonth} ${cardYear}: 
        Mensual: ${cardCalculations.mensual?.toFixed(2)}%, 
        Acumulada: ${cardCalculations.acumulada?.toFixed(2)}%, 
        Anual: ${cardCalculations.anual?.toFixed(2)}%, 
        Promedio: ${cardCalculations.promedioAnual?.toFixed(2)}%. 
        INSTRUCCIONES:
        1. Usa lenguaje ciudadano, fácil de entender (ej: "los precios subieron un poco", "se mantiene estable").
        2. Menciona si está dentro de lo normal (meta de 1-3%).
        3. Máximo 25 palabras. Sé directo y amable.`;

        const res = await ai.models.generateContent({ 
          model: "gemini-3-flash-preview", 
          contents: prompt 
        });
        setCardInterpretation(res.text || "");
      } catch (err: any) {
        console.error("Card AI Error:", err);
        if (err?.message?.includes("quota") || err?.message?.includes("429")) {
          setCardInterpretation("Límite de consultas alcanzado. Reintentando...");
        }
      }
    };

    // No clear interpretation here to keep it visible until next one
    const timer = setTimeout(() => {
      generateCardInterpretation();
    }, 800); // Fast feedback

    return () => clearTimeout(timer);
  }, [cardCalculations, selectedIndex, cardYear, cardMonth]);

  // Generate AI Interpretation
  useEffect(() => {
    const generateInterpretations = async () => {
      if (!selectedIndex || filteredChartData.length === 0) return;

      const ai = getAI();
      if (!ai) {
        const msg = "Error: API Key no configurada.";
        setTrendInterpretation(msg);
        setComparisonInterpretation(msg);
        setYearlyInterpretation(msg);
        setHeatmapInterpretation(msg);
        return;
      }

      setIsGeneratingAI(true);
      try {
        const metricLabels: Record<MetricType, string> = {
          indice: "Índice de Precios",
          mensual: "Variación Mensual (%)",
          acumulado: "Variación Acumulada (%)",
          anual: "Variación Anual (%)"
        };

        const currentMetric = metricLabels[selectedMetric];
        const trendData = filteredChartData.slice(-12).map(d => `${d.name}: ${d[selectedMetric] || d.prediction}`).join(", ");
        
        const combinedPrompt = `Eres un analista del INEI. Explica de forma sencilla y clara para la población los siguientes datos de "${selectedIndex.name}" (Métrica: ${currentMetric}):

1. TENDENCIA: Basado en: ${trendData}.
2. COMPARATIVA: Patrones entre meses o años.
3. EVOLUCIÓN: Comportamiento a largo plazo.
4. CALOR: Meses con más cambios.

INSTRUCCIONES:
- Responde en JSON con llaves: "trend", "comparison", "yearly", "heatmap".
- Usa lenguaje ciudadano, accesible para todos (evita tecnicismos excesivos).
- Máximo 25 palabras por respuesta.
- No inventes datos. Si falta información, di "Sin datos suficientes".
- Idioma: Español claro y sencillo.`;

        const res = await ai.models.generateContent({ 
          model: "gemini-3-flash-preview", 
          contents: combinedPrompt,
          config: { responseMimeType: "application/json" }
        });
        
        const result = JSON.parse(res.text || "{}");
        setTrendInterpretation(result.trend || "Sin análisis.");
        setComparisonInterpretation(result.comparison || "Sin análisis.");
        setYearlyInterpretation(result.yearly || "Sin análisis.");
        setHeatmapInterpretation(result.heatmap || "Sin análisis.");

      } catch (err: any) {
        console.error("AI Error:", err);
        let errorMsg = "Error al generar análisis.";
        if (err?.message?.includes("quota") || err?.message?.includes("429")) {
          errorMsg = "Límite de consultas alcanzado. Por favor, intente en unos minutos.";
        }
        setTrendInterpretation(errorMsg);
        setComparisonInterpretation(errorMsg);
        setYearlyInterpretation(errorMsg);
        setHeatmapInterpretation(errorMsg);
      } finally {
        setIsGeneratingAI(false);
      }
    };

    const timer = setTimeout(() => {
      generateInterpretations();
    }, 800); // Optimized debounce for faster automatic updates

    return () => clearTimeout(timer);
  }, [selectedId, selectedYear, selectedMetric, selectedIndex, filteredChartData, availableYears]);

  if (loading) {
    return (
      <div className="p-4 md:p-8 w-full space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center space-y-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h1 className="text-2xl font-bold">Ups! Algo salió mal</h1>
        <p className="text-muted-foreground">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-4 h-4" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 p-4 md:p-6 font-sans">
      <div className="w-full space-y-6">
        {/* Header */}
        <header className="flex flex-col items-center text-center space-y-4 border-b border-neutral-200 pb-8">
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-[#005596]">
              <TrendingUp className="w-8 h-8" />
              <span className="font-mono text-sm font-bold tracking-[0.2em] uppercase opacity-80">
                Sistema de Consulta Económica
              </span>
            </div>
            <h1 className="text-5xl md:text-6xl font-black tracking-tighter text-[#005596] drop-shadow-md leading-none">
              Índices de Precios INEI <span className="text-[#E30613] block md:inline">en tiempo real</span>
            </h1>
            <div className="flex flex-col items-center space-y-2">
              <p className="text-xl text-neutral-700 max-w-3xl font-semibold leading-snug">
                Plataforma avanzada de visualización y análisis de indicadores de precios al consumidor y al por mayor en el Perú.
              </p>
              <div className="h-1 w-24 bg-[#E30613] rounded-full opacity-80" />
              <p className="text-sm text-neutral-500 max-w-2xl italic font-medium">
                Datos oficiales procesados en tiempo real desde los reportes técnicos del Instituto Nacional de Estadística e Informática (INEI).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 pt-2">
            {selectedIndex && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" className="gap-2 border-[#005596] text-[#005596] hover:bg-blue-50 bg-white shadow-sm font-bold">
                    <FileSpreadsheet className="w-4 h-4" />
                    Explorar Tabla de Datos
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[98vw] w-full max-h-[95vh] overflow-hidden flex flex-col p-0 border-none shadow-2xl">
                  <DialogHeader className="p-8 bg-[#005596] text-white">
                    <DialogTitle className="text-3xl font-bold">Base de Datos: {selectedIndex.name}</DialogTitle>
                    <DialogDescription className="text-blue-100 text-lg">
                      Visualización detallada de los registros históricos extraídos.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-auto px-8 pb-8 pt-4 bg-neutral-50">
                    <div className="min-w-max border rounded-xl bg-white shadow-lg overflow-hidden">
                      <Table>
                        <TableHeader className="bg-neutral-100 sticky top-0 z-10">
                          <TableRow>
                            {selectedIndex.data[0]?.map((header, i) => (
                              <TableHead key={i} className="font-bold text-[#005596] border-r last:border-r-0 px-6 py-4 uppercase text-[10px] tracking-wider">
                                {String(header)}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedIndex.data.slice(1).map((row, rowIndex) => (
                            <TableRow key={rowIndex} className="hover:bg-blue-50/30 transition-colors border-b last:border-0">
                              {row.map((cell, cellIndex) => (
                                <TableCell 
                                  key={cellIndex} 
                                  className="text-xs whitespace-nowrap px-6 py-3 border-r last:border-r-0 text-neutral-700 font-medium"
                                >
                                  {cell !== null && cell !== undefined ? String(cell) : "---"}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Badge variant="outline" className="py-1.5 px-4 border-[#005596] text-[#005596] bg-blue-50/50 font-bold">
              Reporte: Marzo 2026
            </Badge>
          </div>
        </header>

        {/* Selector Section */}
        <div className="flex flex-wrap gap-6 bg-white p-6 rounded-xl shadow-sm border border-neutral-100">
          <div className="flex-1 min-w-[300px] space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Reporte Principal
            </label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="w-full bg-neutral-50 border-neutral-200">
                <SelectValue>
                  {indices.find(idx => idx.id === selectedId)?.name || "Selecciona un índice"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {indices.map((index) => (
                  <SelectItem key={index.id} value={index.id}>
                    {index.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48 space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Año de Referencia
            </label>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-full bg-neutral-50 border-neutral-200">
                <SelectValue>
                  {selectedYear === "all" ? "Todos los años" : selectedYear}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los años</SelectItem>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-64 space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
              Métrica a Visualizar
            </label>
            <Select value={selectedMetric} onValueChange={(v) => setSelectedMetric(v as MetricType)}>
              <SelectTrigger className="w-full bg-neutral-50 border-neutral-200">
                <SelectValue>
                  {{
                    indice: "Índice",
                    mensual: "Variación Mensual (%)",
                    acumulado: "Variación Acumulada (%)",
                    anual: "Variación Anual (%)"
                  }[selectedMetric]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="indice">Índice</SelectItem>
                <SelectItem value="mensual">Variación Mensual (%)</SelectItem>
                <SelectItem value="acumulado">Variación Acumulada (%)</SelectItem>
                <SelectItem value="anual">Variación Anual (%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Summary Row */}
        {selectedIndex && selectedIndex.success && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {(() => {
              const chartData = selectedIndex.chartData || [];
              const last = chartData.length > 0 ? chartData[chartData.length - 1] : null;
              
              const formatValue = (val: number | null | undefined) => {
                if (val === null || val === undefined) return "---";
                return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
              };

              return (
                <>
                  <Card className="border-none shadow-sm">
                    <CardContent className="pt-6">
                      <p className="text-[10px] font-bold uppercase text-neutral-400">Último Índice</p>
                      <p className="text-2xl font-bold tracking-tighter">
                        {last?.indice !== undefined ? last.indice.toFixed(2) : "---"}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm">
                    <CardContent className="pt-6">
                      <p className="text-[10px] font-bold uppercase text-neutral-400">Var. Mensual</p>
                      <p className={`text-2xl font-bold tracking-tighter ${last?.mensual !== null && last?.mensual !== undefined ? (last.mensual >= 0 ? "text-green-600" : "text-red-600") : ""}`}>
                        {formatValue(last?.mensual)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm">
                    <CardContent className="pt-6">
                      <p className="text-[10px] font-bold uppercase text-neutral-400">Var. Acumulada</p>
                      <p className={`text-2xl font-bold tracking-tighter ${last?.acumulado !== null && last?.acumulado !== undefined ? (last.acumulado >= 0 ? "text-green-600" : "text-red-600") : ""}`}>
                        {formatValue(last?.acumulado)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm">
                    <CardContent className="pt-6">
                      <p className="text-[10px] font-bold uppercase text-neutral-400">Var. Anual</p>
                      <p className={`text-2xl font-bold tracking-tighter ${last?.anual !== null && last?.anual !== undefined ? (last.anual >= 0 ? "text-green-600" : "text-red-600") : ""}`}>
                        {formatValue(last?.anual)}
                      </p>
                    </CardContent>
                  </Card>
                </>
              );
            })()}
          </div>
        )}

        {/* Main Content */}
        {selectedIndex && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {selectedIndex.success ? (
              <>
                {/* Prediction Indicator (if active) */}
                {selectedMetric !== "indice" && filteredChartData.some(d => d.isPrediction) && (
                  <Card className="border-none shadow-sm bg-purple-50/40 border-l-4 border-l-purple-500">
                    <CardContent className="py-4 flex items-center gap-4">
                      <div className="bg-purple-100 p-2 rounded-full shrink-0">
                        <BrainCircuit className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-purple-400 uppercase tracking-widest mb-1">Modelo Predictivo Activo</p>
                        <p className="text-sm text-purple-900 font-medium leading-snug">
                          Se ha aplicado el modelo <span className="font-bold">Holt-Winters (Triple Suavizado)</span> para proyectar los próximos 6 meses basándose en patrones estacionales históricos.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Trend Chart (Full Width) */}
                <Card className="border-none shadow-md overflow-hidden bg-white">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-neutral-100 pb-4 bg-slate-50/50">
                    <div className="text-center w-full">
                      <CardTitle className="text-xl font-bold text-[#005596]">
                        Tendencia Temporal: {selectedIndex.name}
                      </CardTitle>
                      <CardDescription className="font-medium">
                        {selectedMetric === 'indice' ? 'Índice de Precios' : 'Variación Porcentual'} - {selectedYear === "all" ? "Histórico Completo" : `Periodo ${selectedYear}`}
                      </CardDescription>
                    </div>
                    <TrendingUp className="w-5 h-5 text-[#005596] absolute right-6" />
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <div className="h-[500px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={filteredChartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis 
                            dataKey="name" 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            tick={{ fill: '#666' }}
                          />
                          <YAxis 
                            fontSize={10} 
                            tickLine={false} 
                            axisLine={false}
                            tick={{ fill: '#666' }}
                            domain={['auto', 'auto']}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            formatter={(value: any, name: string) => [
                              typeof value === 'number' ? value.toFixed(2) + (selectedMetric !== 'indice' ? '%' : '') : value,
                              name === 'prediction' ? 'Predicción (Holt-Winters)' : 'Dato Real'
                            ]}
                          />
                          <Legend verticalAlign="top" height={36}/>
                          <Line 
                            type="monotone" 
                            dataKey={selectedMetric} 
                            name="Dato Real"
                            stroke="#005596" 
                            strokeWidth={3} 
                            dot={{ r: 4, fill: '#005596', strokeWidth: 0 }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            connectNulls
                          />
                          <Line 
                            type="monotone" 
                            dataKey="prediction" 
                            name="Predicción"
                            stroke="#E30613" 
                            strokeWidth={3} 
                            strokeDasharray="5 5"
                            dot={{ r: 4, fill: '#E30613', strokeWidth: 0 }}
                            activeDot={{ r: 6, strokeWidth: 0 }}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Interpretation for Trend */}
                    <div className="bg-blue-50/50 p-6 rounded-xl border border-blue-100 flex flex-col items-center text-center gap-3">
                      <Sparkles className="w-6 h-6 text-[#005596]" />
                      <div className="max-w-3xl">
                        {isGeneratingAI ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="w-4 h-4 text-[#005596] animate-spin" />
                            <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest text-center">Analizando tendencia...</span>
                          </div>
                        ) : (
                          <p className="text-base text-neutral-800 font-medium leading-relaxed italic">
                            "{trendInterpretation}"
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {/* Year Comparison Chart */}
                  <Card className="border-none shadow-md overflow-hidden bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-neutral-100 pb-4 bg-slate-50/50">
                      <div className="text-center w-full">
                        <CardTitle className="text-xl font-bold text-[#005596]">Comparativa Estacional: {selectedIndex.name}</CardTitle>
                        <CardDescription className="font-medium">
                          Comportamiento Mensual por Años
                        </CardDescription>
                      </div>
                      <BarChart3 className="w-5 h-5 text-[#005596] absolute right-6" />
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={comparisonData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis 
                              dataKey="month" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              tick={{ fill: '#666' }}
                            />
                            <YAxis 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              tick={{ fill: '#666' }}
                              domain={['auto', 'auto']}
                            />
                            <Tooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Legend verticalAlign="top" height={36}/>
                            {availableYears.slice(0, 5).map((year, index) => (
                              <Line 
                                key={year}
                                type="monotone" 
                                dataKey={year} 
                                stroke={["#005596", "#E30613", "#10b981", "#f59e0b", "#8b5cf6"][index % 5]} 
                                strokeWidth={2} 
                                dot={{ r: 3 }}
                                connectNulls
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Interpretation for Comparison */}
                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col items-center text-center gap-3">
                        <BrainCircuit className="w-6 h-6 text-[#005596]" />
                        <div className="max-w-xl">
                          {isGeneratingAI ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="w-4 h-4 text-[#005596] animate-spin" />
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center">Analizando comparativa...</span>
                            </div>
                          ) : (
                            <p className="text-sm text-neutral-700 font-medium leading-relaxed italic">
                              "{comparisonInterpretation}"
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Yearly Evolution Chart */}
                  <Card className="border-none shadow-md overflow-hidden bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-neutral-100 pb-4 bg-slate-50/50">
                      <div className="text-center w-full">
                        <CardTitle className="text-xl font-bold text-[#005596]">Evolución Anual: {selectedIndex.name}</CardTitle>
                        <CardDescription className="font-medium">
                          Promedio Anual de {selectedMetric === 'indice' ? 'Índice' : 'Variación'}
                        </CardDescription>
                      </div>
                      <BarChartIcon className="w-5 h-5 text-[#005596] absolute right-6" />
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6">
                      <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={yearlyData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis 
                              dataKey="year" 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              tick={{ fill: '#666' }}
                            />
                            <YAxis 
                              fontSize={10} 
                              tickLine={false} 
                              axisLine={false}
                              tick={{ fill: '#666' }}
                            />
                            <Tooltip 
                              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                              formatter={(value: number) => [value.toFixed(2) + (selectedMetric !== 'indice' ? '%' : ''), 'Valor Promedio']}
                            />
                            <Bar dataKey="value" fill="#005596" radius={[4, 4, 0, 0]}>
                              {yearlyData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.value >= 0 ? "#005596" : "#E30613"} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col items-center text-center gap-3">
                        <Sparkles className="w-6 h-6 text-[#005596]" />
                        <div className="max-w-xl">
                          {isGeneratingAI ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="w-4 h-4 text-[#005596] animate-spin" />
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center">Analizando evolución...</span>
                            </div>
                          ) : (
                            <p className="text-sm text-neutral-700 font-medium leading-relaxed italic">
                              "{yearlyInterpretation}"
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Heatmap and Calculator Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Heatmap Section (Left - 2/3) */}
                  <Card className="lg:col-span-2 border-none shadow-md overflow-hidden flex flex-col bg-white">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-neutral-100 pb-4 bg-slate-50/50">
                      <div className="text-center w-full">
                        <CardTitle className="text-xl font-bold text-[#005596]">Mapa de Calor: {selectedIndex.name}</CardTitle>
                        <CardDescription className="font-medium">
                          Intensidad Mensual (Últimos 10 años)
                        </CardDescription>
                      </div>
                      <LayoutGrid className="w-5 h-5 text-[#005596] absolute right-6" />
                    </CardHeader>
                    <CardContent className="pt-6 flex-1 flex flex-col justify-between">
                      <div className="overflow-x-auto">
                        <div className="min-w-[600px]">
                          <div className="grid grid-cols-[60px_repeat(12,1fr)] gap-1 mb-2">
                            <div className="text-[9px] font-bold text-neutral-400 uppercase">Año</div>
                            {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map(m => (
                              <div key={m} className="text-[9px] font-bold text-neutral-400 uppercase text-center">{m}</div>
                            ))}
                          </div>
                          <div className="space-y-1">
                            {heatmapData.map(row => (
                              <div key={row.year} className="grid grid-cols-[60px_repeat(12,1fr)] gap-1 h-8">
                                <div className="flex items-center text-[10px] font-bold text-neutral-600">{row.year}</div>
                                {["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"].map(m => {
                                  const val = row[m];
                                  if (val !== null) {
                                    if (selectedMetric === 'indice') {
                                      const opacity = Math.min(100, Math.max(10, (val / 150) * 100));
                                      return <div key={m} className="rounded-sm flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: `rgba(0, 85, 150, ${opacity/100})` }}>{val.toFixed(0)}</div>;
                                    } else {
                                      const absVal = Math.abs(val);
                                      const opacity = Math.min(100, Math.max(10, (absVal / 2) * 100));
                                      const color = val >= 0 ? `rgba(16, 185, 129, ${opacity/100})` : `rgba(227, 6, 19, ${opacity/100})`;
                                      return <div key={m} className="rounded-sm flex items-center justify-center text-[8px] font-bold text-white" style={{ backgroundColor: color }}>{val.toFixed(1)}</div>;
                                    }
                                  }
                                  return <div key={m} className="bg-neutral-50 rounded-sm"></div>;
                                })}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col items-center text-center gap-3 mt-6">
                        <Sparkles className="w-6 h-6 text-[#005596]" />
                        <div className="max-w-xl">
                          {isGeneratingAI ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="w-4 h-4 text-[#005596] animate-spin" />
                              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center">Analizando patrones...</span>
                            </div>
                          ) : (
                            <p className="text-sm text-neutral-700 font-medium leading-relaxed italic">
                              "{heatmapInterpretation}"
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Inflation Calculator Card (Right - 1/3) */}
                  <Card className="border-none shadow-md flex flex-col bg-white">
                    <CardHeader className="border-b border-neutral-100 pb-4 bg-slate-50/50">
                      <div className="text-center w-full">
                        <CardTitle className="text-xl flex items-center justify-center gap-2 text-[#005596] font-bold">
                          <Calculator className="w-5 h-5" />
                          Calculadora de Inflación
                        </CardTitle>
                        <CardDescription className="font-medium">
                          Resultados para {cardMonth} {cardYear}
                        </CardDescription>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-6 flex-1">
                      {/* Internal Controls */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Año</label>
                          <Select value={cardYear} onValueChange={setCardYear}>
                            <SelectTrigger className="w-full bg-neutral-50 border-neutral-200 h-9 text-xs">
                              <SelectValue placeholder="Año" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableYears.map(year => (
                                <SelectItem key={year} value={year}>{year}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">Mes</label>
                          <Select value={cardMonth} onValueChange={setCardMonth}>
                            <SelectTrigger className="w-full bg-neutral-50 border-neutral-200 h-9 text-xs">
                              <SelectValue placeholder="Mes" />
                            </SelectTrigger>
                            <SelectContent>
                              {["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"].map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {/* Results */}
                      <div className="space-y-4 pt-4">
                        <div className="p-4 rounded-xl bg-neutral-50 border border-neutral-100 space-y-4">
                          <div className="flex justify-between items-end border-b border-neutral-200 pb-2">
                            <span className="text-xs font-bold text-neutral-600 uppercase">Inflación Anual</span>
                            <span className={`text-xl font-bold ${cardCalculations?.anual && cardCalculations.anual >= 0 ? "text-[#005596]" : "text-[#E30613]"}`}>
                              {cardCalculations?.anual !== null ? `${cardCalculations?.anual.toFixed(2)}%` : "---"}
                            </span>
                          </div>
                          <div className="flex justify-between items-end border-b border-neutral-200 pb-2">
                            <span className="text-xs font-bold text-neutral-600 uppercase">Promedio Anual</span>
                            <span className="text-xl font-bold text-neutral-900">
                              {cardCalculations?.promedioAnual !== null ? `${cardCalculations?.promedioAnual.toFixed(2)}%` : "---"}
                            </span>
                          </div>
                          <div className="flex justify-between items-end border-b border-neutral-200 pb-2">
                            <span className="text-xs font-bold text-neutral-600 uppercase">Inflación Acumulada</span>
                            <span className={`text-xl font-bold ${cardCalculations?.acumulada && cardCalculations.acumulada >= 0 ? "text-[#005596]" : "text-[#E30613]"}`}>
                              {cardCalculations?.acumulada !== null ? `${cardCalculations?.acumulada.toFixed(2)}%` : "---"}
                            </span>
                          </div>
                          <div className="flex justify-between items-end">
                            <span className="text-xs font-bold text-neutral-600 uppercase">Inflación Mensual</span>
                            <span className={`text-xl font-bold ${cardCalculations?.mensual && cardCalculations.mensual >= 0 ? "text-[#005596]" : "text-[#E30613]"}`}>
                              {cardCalculations?.mensual !== null ? `${cardCalculations?.mensual.toFixed(2)}%` : "---"}
                            </span>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center text-center gap-2">
                          <BrainCircuit className="w-5 h-5 text-[#005596]" />
                          <p className="text-xs text-neutral-700 font-medium leading-relaxed italic">
                            {cardInterpretation ? `"${cardInterpretation}"` : (cardCalculations ? "Analizando resultados..." : "Seleccione un periodo válido")}
                          </p>
                        </div>

                        <div className="text-[9px] text-neutral-400 italic leading-tight text-center">
                          * Cálculos independientes basados en el periodo seleccionado.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Analysis Note */}
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
                  <div className="text-sm text-blue-800">
                    <p className="font-bold">Nota sobre la estructura:</p>
                    <p>
                      Los datos comparativos muestran los últimos 5 años disponibles para facilitar la lectura estacional.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <Card className="border-dashed border-2 border-neutral-200 bg-neutral-50">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertCircle className="w-8 h-8 text-destructive mb-4" />
                  <p className="font-medium text-neutral-900">No se pudo procesar este archivo</p>
                  <p className="text-sm text-neutral-500">{selectedIndex.error}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-neutral-200 text-center space-y-2 pb-8">
          <div className="flex items-center justify-center gap-2 text-[#005596] font-bold">
            <TrendingUp className="w-5 h-5" />
            <span>INEI Data Viewer v2.0</span>
          </div>
          <p className="text-sm text-neutral-500 font-medium">
            Creador: <span className="text-[#005596] font-bold">Luis Dennis Quispe Herrera</span>
          </p>
          <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
            © 2026 Instituto Nacional de Estadística e Informática - Todos los derechos reservados
          </p>
        </footer>
      </div>
    </div>
  );
}
