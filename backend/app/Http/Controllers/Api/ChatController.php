<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatSession;
use App\Services\ChatbotService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class ChatController extends Controller
{
    public function __construct(
        private readonly ChatbotService $chatbotService
    ) {}

    /**
     * Send message to chatbot
     */
    public function message(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'message'    => ['required', 'string', 'min:1', 'max:2000'],
            'session_id' => ['nullable', 'integer', 'exists:chat_sessions,id'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => 'error',
                'errors' => $validator->errors(),
            ], 422);
        }

        $session = $this->chatbotService->getOrCreateSession(
            $request->user(),
            $request->input('session_id')
        );

        $response = $this->chatbotService->chat(
            $session,
            $request->message
        );

        return response()->json([
            'status' => 'success',
            'data'   => [
                'session_id'      => $session->id,
                'user_message'    => $request->message,
                'assistant_reply' => $response['content'],
                'sources'         => $response['sources'],
                'tokens_used'     => $response['tokens_used'],
            ],
        ]);
    }

    /**
     * Chat history
     */
    public function history(Request $request): JsonResponse
    {
        $sessions = ChatSession::where('user_id', $request->user()->id)
            ->where('is_active', true)
            ->with('latestMessage')
            ->orderByDesc('updated_at')
            ->paginate(20);

        return response()->json([
            'status' => 'success',
            'data'   => $sessions,
        ]);
    }

    /**
     * Single session
     */
    public function session(Request $request, int $id): JsonResponse
    {
        $session = ChatSession::where('user_id', $request->user()->id)
            ->with('messages')
            ->findOrFail($id);

        return response()->json([
            'status' => 'success',
            'data'   => $session,
        ]);
    }

    /**
     * Delete session
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        ChatSession::where('user_id', $request->user()->id)
            ->findOrFail($id)
            ->update([
                'is_active' => false,
            ]);

        return response()->json([
            'status'  => 'success',
            'message' => 'Session deleted.',
        ]);
    }
}
