import app from './App'

process.env.NODE_ENV = process.env.NODE_ENV || 'dev'

const port = process.env.PORT || 3000

app.listen(port, (err) => {
    if (err) {
        return console.log(err)
    }
    return console.log(`server is listening on ${port}`)
});