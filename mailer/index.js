const nodemailer = require("nodemailer")
const OAuth = require('../config.json').OAuthClient
const {OAuth2Client} = require('google-auth-library')

const myOAuth2Client = new OAuth2Client(
    OAuth.GOOGLE_MAILER_CLIENT_ID,
    OAuth.GOOGLE_MAILER_CLIENT_SECRET
)

myOAuth2Client.setCredentials({
    refresh_token: OAuth.GOOGLE_MAILER_REFRESH_TOKEN
})

module.exports = {

    sendEMail: async function(destination, subject, content, callback){

        const myAccessTokenObject = await myOAuth2Client.getAccessToken()
        const myAccessToken = myAccessTokenObject?.token

        const mailOption = {
            to: destination,
            subject: subject, 
            text: content
        }

        const tranporter = nodemailer.createTransport({
            service: OAuth.service,
            auth: {
                type: OAuth.type,
                user: OAuth.ADMIN_EMAIL_ADDRESS,
                clientId: OAuth.GOOGLE_MAILER_CLIENT_ID,
                clientSecret: OAuth.GOOGLE_MAILER_CLIENT_SECRET,
                refresh_token: OAuth.GOOGLE_MAILER_REFRESH_TOKEN,
                accessToken: myAccessToken,
            }
        })
        tranporter.sendMail(mailOption, callback)
    }
}
