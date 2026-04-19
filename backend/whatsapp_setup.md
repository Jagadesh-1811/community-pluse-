# WhatsApp API Setup Guide

To connect your CommunityPulse backend to the Meta WhatsApp Cloud API, follow these steps to obtain your **Access Token** and **Phone Number ID**.

## 1. Create a Meta Developer App
1.  Go to [developers.facebook.com](https://developers.facebook.com/) and sign in.
2.  Click **My Apps** -> **Create App**.
3.  Choose **Other** -> **Business** (or "Set up a WhatsApp business account").
4.  Give your app a name (e.g., `CommunityPulse-Test`).

## 2. Add WhatsApp to your App
1.  In the left sidebar of your App Dashboard, click **Add Product**.
2.  Find **WhatsApp** and click **Set up**.
3.  Choose or create a Meta Business Account if prompted.

## 3. Get API Credentials
1.  Navigate to **WhatsApp** -> **API Setup** in the sidebar.
2.  **Phone Number ID**: Copy the long string of digits under **Phone number ID**. 
    *   *Note: This is different from the WhatsApp Business Account ID.*
3.  **Temporary Access Token**: Copy the token at the top of the page.
    *   > [!WARNING]
    *   > This token expires every 24 hours. For production, you must create a **System User** in your Meta Business Settings to get a permanent token.

## 4. Add a Test Recipient
1.  Scroll down to **Step 5: Add a phone number**.
2.  Add your own phone number to the list of test recipients.
3.  Meta will send you a verification code. Once verified, the dashboard can send messages to this number.

## 5. Update your `.env` File
Paste the values into your `backend/.env`:
```bash
WHATSAPP_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
```

## 6. Testing local development
*   The current implementation uses a **simple text message**. 
*   Meta's policy requires that you can only send free-form text messages to users who have messaged you first in the last 24 hours (a "service window"). 
*   For broadcast alerts, you will eventually need to register **Message Templates**.
