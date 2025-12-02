import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const NETSUITE_RESTLET_URL = process.env.NETSUITE_RESTLET_URL || 
  'https://7913744.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=2796&deploy=1';

export async function GET(request: Request) {
  try {
    // Check if we should use NetSuite API or sample data
    const useNetSuite = process.env.USE_NETSUITE_API === 'true' && 
                        process.env.NETSUITE_OAUTH_CONSUMER_KEY &&
                        process.env.NETSUITE_OAUTH_TOKEN &&
                        process.env.NETSUITE_OAUTH_CONSUMER_SECRET &&
                        process.env.NETSUITE_OAUTH_TOKEN_SECRET;

    if (useNetSuite) {
      // Fetch from NetSuite API
      const response = await fetchFromNetSuite();
      return NextResponse.json(response);
    } else {
      // Use sample data (fallback for development)
      const filePath = path.join(process.cwd(), 'sample-response.json');
      const fileContents = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContents);
      
      return NextResponse.json(data);
    }
  } catch (error) {
    console.error('Error loading orders:', error);
    return NextResponse.json(
      { 
        error: 'Failed to load orders',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

async function fetchFromNetSuite() {
  const consumerKey = process.env.NETSUITE_OAUTH_CONSUMER_KEY!;
  const consumerSecret = process.env.NETSUITE_OAUTH_CONSUMER_SECRET!;
  const token = process.env.NETSUITE_OAUTH_TOKEN!;
  const tokenSecret = process.env.NETSUITE_OAUTH_TOKEN_SECRET!;
  const realm = process.env.NETSUITE_REALM || '7913744';

  // Create OAuth instance
  const oauth = new OAuth({
    consumer: {
      key: consumerKey,
      secret: consumerSecret,
    },
    signature_method: 'HMAC-SHA256',
    hash_function(baseString, key) {
      return crypto.createHmac('sha256', key).update(baseString).digest('base64');
    },
  });

  // Generate OAuth request data
  const requestData = {
    url: NETSUITE_RESTLET_URL,
    method: 'GET',
  };

  const tokenData = {
    key: token,
    secret: tokenSecret,
  };

  // Generate authorization header
  const authHeader = oauth.toHeader(oauth.authorize(requestData, tokenData));
  
  // Add realm to authorization header (NetSuite specific)
  const authorization = `OAuth realm="${realm}",${authHeader.Authorization.substring(6)}`;

  const response = await fetch(NETSUITE_RESTLET_URL, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authorization,
      'Accept': '*/*',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`NetSuite API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  return data;
}
