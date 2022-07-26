// Import module
const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')
const cron = require('node-cron')
const mqttUtils = require('./mqtt_utils')
const mqttInfo = require('./config.json').MQTTBrokerInfo
const database = require('./database')
const utils = require('./utils')

// Import HTTP route
const indexController = require('./routes/index')
const userController = require('./routes/user')

// Khởi tạo express
const app = express()
const port = process.env.PORT || '9999'

// Tạo MQTT Client
const mqttClient = mqttUtils.getMQTTClient()

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

// NodeJS Middleware
app.use(logger('tiny'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use('/public', express.static(path.join(__dirname, 'public')))

// HTTP route
indexController(app, mqttClient)
userController(app, mqttClient)

// MQTT connection
// Thông tin topic
const dataTopic = mqttInfo.dataTopic
const commandTopic = mqttInfo.commandTopic
const stateTopic = mqttInfo.stateTopic

// Đăng ký và nhận dữ liệu từ sensor trên data topic
mqttClient.on('connect', () => {
  console.log(`Connected to Broker ${mqttInfo.host} port ${mqttInfo.port}`)
  mqttClient.subscribe([dataTopic, stateTopic], () => {
    console.log(`Subscribed to topic ${dataTopic} and ${stateTopic}`);
  })
})

// Xử lý dữ liệu gửi tới
mqttClient.on('message', function(topic, payload){
  // Nếu phần cứng gửi dữ liệu lên
  if(topic == mqttInfo.dataTopic){
    // Lấy dữ liệu

    const data = JSON.parse(payload.toString())
    console.log(data)

    const deviceid = + data['deviceid']
    const temp = (+ data['temperature']).toFixed(2)
    const humi = (+ data['humidity']).toFixed(2)
    const fire = + data['fire']
    const gas = + data['gas']
    console.log('------------------------------------')
    console.log(`Recieve data from ${deviceid}: \n\t- Temperature: \t${temp}\n\t- Humidity: \t${humi}\n\t- Fire: \t${fire}\n\t- Gas: \t\t${gas}\n`);

    // Đánh giá độ nguy hiểm theo độ ưu tiên fire > gas > temp and humi
    var response = {};
    response['type'] = "warning"
    response['deviceid'] = deviceid

    if(humi < 45){
      response['danger'] = 1
    }

    if(temp > 60){
      response['danger'] = 1
    }

    if(gas > 2375){
      response['hasGas'] = 1
      response['danger'] = 1
    }
    else{
      response['hasGas'] = 0
    }

    if(fire < 3500){
      response['hasFire'] = 1
      response['danger'] = 1
    }
    else{
      response['hasFire'] = 0
    }

    if(!response['danger']){
      response['danger'] = 0
    }

    // Lưu dữ liệu xuống CSDL
    const conn = database.createConnection()

    // Lưu trữ vào CSDL
    conn.query('insert into environment_state(deviceid, temperature, humidity, fire, gas, thoigian, warning) values (?, ?, ?, ?, ?, ?, ?)', [deviceid, temp, humi, fire, gas, utils.getCurrentDateString(), response['danger']], function(err, results){
      if(err) throw err

      console.log("Saved data to database.\n")
      conn.end()
    })

    // Gửi lại dữ liệu vào kênh command
    mqttClient.publish(commandTopic, JSON.stringify(response), {qos: 0, retain: false}, (error) => {
      if(error){
        console.error(error)
      }

      console.log(`Send result to topic ${commandTopic}\n\t- Has fire: \t${response['hasFire']}\n\t- Has gas: \t${response['hasGas']}\n\t- Danger: \t${response['danger']}\n`);
    })
  }

  // Nếu phần cứng báo cáo thay đổi trạng thái
  if(topic == stateTopic){
    // Cập nhật trạng thái mới trên cơ sở dữ liệu
    const data = JSON.parse(payload.toString())
    console.log(data)

    // trạng thái mới của hệ thống
    const newState = data.state
    const deviceid = + data.deviceid
    console.log(deviceid, newState);
    
    // Tạo kết nối CSDL
    const conn = database.createConnection()
    conn.query(`update system_state set state = ? where deviceid = ?`, [newState, deviceid], function(err, results){
      if(err) throw err

      console.log('Cập nhật thành công')
      conn.end()
    })
  }
})

// Đặt lịch xóa dữ liệu ngày hôm trước vào đúng 0h sáng mỗi ngày
var task = cron.schedule('0 0 * * *', () =>  {
  const today = new Date()
  const yesterday = utils.getYesterday(today) 
  // Tạo kết nối cơ sở dữ liệu
  const conn = database.createConnection()

  conn.query("delete from environment_state where thoigian between '?-?-?' and '?-?-? 23:59:59'", [yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate(), yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate()], function(err, results){
    if(err) throw err
    console.log(`Delete data: ${utils.formatDate(yesterday)}`);

    conn.end()
  })
}, {
  scheduled: false
});

task.start()

app.listen(port, function(){
  console.log(`Server is running on  http://localhost:${port}`);
})
