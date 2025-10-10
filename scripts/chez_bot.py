import base64, pprint, json, requests, time
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

slack_token = ""
slack_channel = "#chez-bot"
slack_url = "https://slack.com/api/chat.postMessage"


def send_message():

    text = "testing testing"

    blocks = [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"PAY YOUR DEBTS YOU STINKERS",
            },
        },
    ]

    content = {
        "token": slack_token,
        "channel": slack_channel,
        "text": text,
        "blocks": json.dumps(blocks),
        "unfurl_links": True,
        "unfurl_media": True,
    }
    resp = requests.post(slack_url, content)

    print(resp.content)


def main():

    send_message()


main()
