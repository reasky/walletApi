const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId  } = require('mongodb');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('./config');

const app = express();
const port = 5555;
app.use(express.json());

const client = new MongoClient(config.mongoURI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
        tls: true,
        tlsAllowInvalidCertificates: true
    }
  }
);
let usersCollection, walletsCollection;

async function connect() {
    try {
        console.log('Connection to database...');
        await client.connect();
        console.log('Connected to mongodb');
    
        const db = client.db(config.mongoDB); 
        console.log('Database:', db.databaseName);
  
    
        // build database if !exist
        const usersExist = await db.listCollections({ name: 'users' }).hasNext();
        if (!usersExist) {
            await db.createCollection('users');
            console.log('collection created: users');
        }
        usersCollection = db.collection('users');
    
        const walletAccountsExist = await db.listCollections({ name: 'wallet_accounts' }).hasNext();
        if (!walletAccountsExist) {
            await db.createCollection('wallet_accounts');
            console.log('Created collection: wallet_accounts');
        }
        walletsCollection = db.collection('wallet_accounts');
  
    } catch (err) {
      console.error('Error connecting to MongoDB:', err);
    }
}
  
connect().catch(console.error);

// get
app.get('/ping', async (req, res) => {
    res.send('pong');
});

app.get('/getUser', async (req, res) => {
    const { token } = req.query;
  
    if (!token) return res.status(400).json({ error: 'Token is required' });
  
    try {
      const user = await usersCollection.findOne({ token });
      if (!user) return res.status(400).json({ error: 'Invalid token' });
  
      const wallet = await walletsCollection.findOne({ owner: user._id })
  
      res.json({ username: user.username, token: user.token, balance: wallet.balance, currency: wallet.currency });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
});

// post 
app.post('/createUser', async (req, res) => {
  const { username } = req.body;

  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) return res.status(400).json({ error: 'user already exists' });

    const token = uuidv4();
    const newUser = { username, token };

    const result = await usersCollection.insertOne(newUser);
    res.json({ message: 'User cerated', userId: result.insertedId, token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.post('/createWallet', async (req, res) => {
    const { token, balance, currency } = req.body;
  
    if (!token || !balance || !currency) return res.status(400).json({ error: 'Token, balnace, currency required' });
  
    try {
      const user = await usersCollection.findOne({ token });
      if (!user) return res.status(400).json({ error: 'Invalid token' });
  
      const newWallet = {
        owner: user._id,
        balance: parseFloat(balance),
        currency: currency.toUpperCase()
      };
  
      const result = await walletsCollection.insertOne(newWallet);
      res.json({ message: 'Wallet created', walletId: result.insertedId });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'server error' });
    }
});

// transfer and convert
app.post('/transfer', async (req, res) => {
  const { token, walletFrom, recipient, amount } = req.body;

  try {
    const sender = await usersCollection.findOne({ token });
    if (!sender) return res.status(400).json({ error: 'Invalid token' });

    console.log(walletFrom)
    console.log(sender._id)
    const senderWallet = await walletsCollection.findOne({ _id: new ObjectId(walletFrom), owner: sender._id });

    console.log(senderWallet)
    console.log(senderWallet.balance < amount)
    if (!senderWallet || senderWallet.balance < amount) {
      return res.status(400).json({ error: 'Invalid wallet or too more amount' });
    }

    console.log(recipient)
    const recipientUser = await usersCollection.findOne({ username: recipient });
    console.log('Recepient: ', recipientUser)
    if (recipientUser == null) return res.status(400).json({ error: 'Recipient not found' });

    const recipientWallet = await walletsCollection.findOne({ owner: recipientUser._id, currency: 'USDT' });
    if (!recipientWallet) return res.status(400).json({ error: 'Recipient wallet not found' });

    await walletsCollection.updateOne(
      { _id: new ObjectId(walletFrom) },
      { $inc: { balance: -amount } }
    );
    await walletsCollection.updateOne(
      { _id: recipientWallet._id },
      { $inc: { balance: amount } }
    );

    res.json({ message: 'Transfer success' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

// convert part
app.post('/convert', async (req, res) => {
  const { amount } = req.body;

  try {
    const response = await axios.get(`http://api.exchangeratesapi.io/v1/latest`, {
      params: {
        access_key: config.exchangeRate,
        base: 'USD',
        symbols: 'RUB,UAH,KZT'
      }
    });

    const rates = response.data.rates;
    const result = {
      originalAmount: amount,
      RUB: amount * rates.RUB,
      UAH: amount * rates.UAH,
      KZT: amount * rates.KZT
    };

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server error' });
  }
});

app.listen(port, () => {
  console.log(`server started ttp://localhost:${port}/`);
});
