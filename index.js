const express = require('express')
const app = express()
const port = 5000
const connectToMongo = require('./db')
var cors = require('cors')


connectToMongo();
app.use(cors())

app.use(express.json())

app.use('/api/products',require('./routes/products'))
app.get('/', (req, res) => {
  res.send('Hello World!')
})
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})