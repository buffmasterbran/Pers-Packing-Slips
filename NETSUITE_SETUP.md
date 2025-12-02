# NetSuite API Setup

To connect to the NetSuite API instead of using sample data, follow these steps:

## 1. Create Environment Variables File

Create a `.env.local` file in the root directory with the following variables:

```env
# Set to true to use NetSuite API, false to use sample data
USE_NETSUITE_API=true

# NetSuite RESTlet URL
NETSUITE_RESTLET_URL=https://7913744.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=2796&deploy=1

# NetSuite Account ID (realm)
NETSUITE_REALM=7913744

# OAuth 1.0 Credentials (get these from your NetSuite integration)
NETSUITE_OAUTH_CONSUMER_KEY=your_consumer_key_here
NETSUITE_OAUTH_CONSUMER_SECRET=your_consumer_secret_here
NETSUITE_OAUTH_TOKEN=your_token_here
NETSUITE_OAUTH_TOKEN_SECRET=your_token_secret_here
```

## 2. Get OAuth Credentials from NetSuite

1. Log into NetSuite
2. Go to Setup > Integrations > Manage Integrations
3. Create or select your integration
4. Copy the Consumer Key and Consumer Secret
5. Generate Token ID and Token Secret
6. Add these values to your `.env.local` file

## 3. Test the Connection

1. Start the development server: `npm run dev`
2. The app will automatically use NetSuite API if `USE_NETSUITE_API=true` and all credentials are set
3. If credentials are missing, it will fall back to sample data

## Notes

- The `.env.local` file is gitignored and won't be committed to version control
- Keep your OAuth credentials secure and never commit them to git
- The sample data will be used as a fallback if the API connection fails or credentials are missing


