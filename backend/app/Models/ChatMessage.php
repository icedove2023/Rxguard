<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;


/**
 * ChatMessage
 */
class ChatMessage extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'session_id', 'role', 'content', 'sources',
        'gemini_model', 'tokens_used',
    ];

    protected $casts = [
        'sources'    => 'array',
        'created_at' => 'datetime',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(ChatSession::class, 'session_id');
    }
}



