const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();

// Configurar CORS para permitir tu dominio
app.use(cors({
  origin: ['http://localhost:5173', 'https://invest.zionenterprise.com.co'],
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Binance Proxy Server Running',
    timestamp: new Date().toISOString() 
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', uptime: process.uptime() });
});

// Función para generar signature HMAC
function generateSignature(queryString, secretKey) {
  return crypto
    .createHmac('sha256', secretKey)
    .update(queryString)
    .digest('hex');
}

// Endpoint principal del proxy
app.post('/binance-proxy', async (req, res) => {
  try {
    const { apiKey, secretKey, endpoint, params = {} } = req.body;

    if (!apiKey || !endpoint) {
      return res.status(400).json({
        error: 'API Key y endpoint son requeridos'
      });
    }

    console.log(`Procesando petición para: ${endpoint}`);

    // Determinar si necesita autenticación
    const needsSignature = endpoint.includes('account') || 
                          endpoint.includes('allOrders') || 
                          endpoint.includes('myTrades');

    let finalParams = { ...params };

    if (needsSignature) {
      if (!secretKey) {
        return res.status(400).json({
          error: 'Secret Key es requerido para endpoint autenticado'
        });
      }

      // Agregar timestamp
      const timestamp = Date.now();
      finalParams = { ...params, timestamp };

      // Crear query string y signature
      const queryString = new URLSearchParams(finalParams).toString();
      const signature = generateSignature(queryString, secretKey);
      
      finalParams = { ...finalParams, signature };
      
      console.log('Signature generada para endpoint autenticado');
    }

    // Construir URL completa
    const queryString = new URLSearchParams(finalParams).toString();
    const fullUrl = `https://api.binance.com${endpoint}${queryString ? '?' + queryString : ''}`;

    console.log(`Llamando a Binance: ${endpoint}`);

    // Hacer petición a Binance
    const binanceResponse = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'BinanceProxy/1.0'
      }
    });

    console.log(`Respuesta de Binance: ${binanceResponse.status}`);

    if (!binanceResponse.ok) {
      const errorText = await binanceResponse.text();
      console.error(`Error de Binance: ${binanceResponse.status} - ${errorText}`);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { msg: errorText };
      }

      return res.status(400).json({
        error: `Error de Binance: ${errorData.msg || errorText}`,
        status: binanceResponse.status
      });
    }

    const data = await binanceResponse.json();
    console.log(`Respuesta exitosa de Binance para: ${endpoint}`);

    res.json(data);

  } catch (error) {
    console.error('Error en proxy:', error);
    res.status(500).json({
      error: error.message || 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Binance Proxy Server running on port ${PORT}`);
});
