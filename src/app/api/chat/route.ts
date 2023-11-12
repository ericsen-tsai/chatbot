import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import OpenAI from 'openai'
import { ChatCompletionMessageParam } from 'openai/resources'

import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!
})

export async function POST(req: Request) {
  const json = await req.json()
  const { messages } = json as { messages: ChatCompletionMessageParam[] }
  const userId = String((await auth())?.user.id)

  if (!userId || userId !== process.env.VALID_USER_ID) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages
  })

  const stream = OpenAIStream(response, {
    async onCompletion(completion) {
      const title = json.messages[0].content.substring(0, 100)
      const id = json.id ?? nanoid()
      const createdAt = Date.now()
      const path = `/chat/${id}`
      const payload = {
        id,
        title,
        userId,
        createdAt,
        path,
        messages: [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ]
      }
      await kv.hmset(`chat:${id}`, payload)
      await kv.zadd(`user:chat:${userId}`, {
        score: createdAt,
        member: `chat:${id}`
      })
    }
  })

  return new StreamingTextResponse(stream)
}