const express = require('express');
const app = express();
const path = require('path');

app.use(express.static(__dirname + '/dist'));

var port = process.env.PORT || 4434;
app.listen(port);

app.get('/*', function(request, response) {
    response.sendFile(path.join(__dirname + '/dist/index.html'));
});

console.log('Listening on', port);