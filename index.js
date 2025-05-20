const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const app = express()
const port = process.env.PORT || 8000

// middlewares
app.use(cors({
  origin: [,
    'online-job-place-client.vercel.app',
  ],
  credentials: true,
  optionsSuccessStatus: 200
}))
app.use(express.json())
app.use(cookieParser())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.awpu5n8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// custom middlewares
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  // console.log("value inside token: ", token);
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized' })
    }
    console.log("Value in the token: ", decoded);
    req.user = decoded
    next()
  })
}
const cookieOption = {
  httpOnly: true,
  sameSite: process.env.NODE_ENV === "production" ? 'none' : "strict",
  secure: process.env.NODE_ENV === "production" ? true : false
}

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)

    const jobCollection = client.db('WorkNestDb').collection('Job')
    const bidCollection = client.db('WorkNestDb').collection('Bid')

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, {
        expiresIn: '365d'
      })
      res
        .cookie('token', token, cookieOption)
        .send({ success: true })
    })
    // to clear cookie when user loges out
    app.post('/logout', async (req, res) => {
      const user = req.body
      res.clearCookie('token', { ...cookieOption, maxAge: 0 }).send({ success: true })
    })

    // job related api

    // loading all data
    app.get('/jobs', async (req, res) => {
      const result = await jobCollection.find().toArray()
      res.send(result)
    })
    // loading a single data
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id
      const result = await jobCollection.findOne({ _id: new ObjectId(id) });
      res.send(result)
    })
    // loading all data from a single user
    app.get('/jobs/:email', async (req, res) => {
      // console.log(tokenEmail);
      const email = req.params.email
      const result = await jobCollection.find({ 'buyer.email': email }).toArray();
      res.send(result)
    })
    // insert one data on the server
    app.post('/jobs', async (req, res) => {
      const data = req.body
      const result = jobCollection.insertOne(data)
      res.send(result)
    })
    // update a data
    app.put('/job/:id', async (req, res) => {
      const id = req.params.id
      const data = req.body
      const query = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          ...data
        }
      }
      const result = await jobCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })
    // delete one data
    app.delete('/job/:id', async (req, res) => {
      const id = req.params.id
      const result = await jobCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result)
    })


    // bid related API
    // save a bid data
    app.post('/bids', async (req, res) => {
      const data = req.body

      // check if it is a duplicated request
      const query= {
        email: data.email,
        jobId: data.jobId
      }
      const alreadyApplied= await bidCollection.findOne(query)
      if(alreadyApplied){
        return res.status(400).send('You have already placed a bid on this job')
      }
      const result = await bidCollection.insertOne(data)

      // Update Bid count in jobs collection 
      const updateDoc= {
        $inc: {bid_count: 1}
      }
      const countQuery= {_id: new ObjectId(data.jobId)}
      const updateBidCount= await jobCollection.updateOne(countQuery, updateDoc)
      console.log(updateBidCount);
      res.send(result)
    })
    // loading all bids data from a single user
    app.get('/myBids/:email', async (req, res) => {
      const email = req.params.email
      const result = await bidCollection.find({ email: email }).toArray();
      res.send(result)
    })
    // loading all bids request data from a single user
    app.get('/bidRequest/:email', async (req, res) => {
      const email = req.params.email
      const result = await bidCollection.find({ 'buyer_email': email }).toArray();
      // console.log(result);
      res.send(result)
    })
    // update status in DB
    app.patch('/bid/:id', async (req, res) => {
      const id = req.params.id
      const status = req.body
      const query = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: { ...status }
      }
      const result = await bidCollection.updateOne(query, updateDoc)
      res.send(result)
    })


  // pagination API\
  // load all jobs for pagination
  app.get('/allJobs', async (req, res) => {
    const page= parseInt(req.query.page) -1
    const size= parseInt(req.query.size)
    const filter= req.query.filter
    const sort= req.query.sort
    const search= req.query.search
    
    let query= {
      title: { $regex: search, $options: 'i' },
    }

    if(filter) query= { ...query, category: filter }

    let option= {}
    if(sort) option= {sort: {deadline : sort === 'asc' ? 1 : -1}}
    const result = await jobCollection.find(query, option).skip(page * size).limit(size).toArray()
    res.send(result)
  })

  // load all data count
  app.get('/jobsCount', async (req, res) => {
    const filter= req.query.filter
    const search= req.query.search
    
    let query= {
      title: { $regex: search, $options: 'i' },
    }

    if(filter) query= {category: filter}
    const count = await jobCollection.countDocuments(query)
    res.send({count})
  })

    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("Work Nest Server is Running")
})
app.listen(port, () => {
  console.log(`Work Nest server is running at port: ${port}`)
})