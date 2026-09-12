<?php


namespace App\Models;


use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;
use Illuminate\Foundation\Auth\User as Authenticatable;
/**
 * BmiRecord
 */
class BmiRecord extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'user_id', 'height_cm', 'weight_kg', 'age', 'gender',
        'bmi_value', 'category', 'nutrition_recs', 'lifestyle_recs', 'notes',
    ];

    protected $casts = [
        'nutrition_recs' => 'array',
        'lifestyle_recs' => 'array',
        'bmi_value'      => 'float',
        'height_cm'      => 'float',
        'weight_kg'      => 'float',
        'recorded_at'    => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Calculate BMI category label for display.
     */
    public static function categoryLabel(float $bmi): string
    {
        return match (true) {
            $bmi < 18.5  => 'Underweight',
            $bmi < 25.0  => 'Normal weight',
            $bmi < 30.0  => 'Overweight',
            $bmi < 35.0  => 'Obese (Class I)',
            $bmi < 40.0  => 'Obese (Class II)',
            default      => 'Obese (Class III)',
        };
    }

    /**
     * Map BMI value to database enum value.
     */
    public static function categoryEnum(float $bmi): string
    {
        return match (true) {
            $bmi < 18.5  => 'underweight',
            $bmi < 25.0  => 'normal',
            $bmi < 30.0  => 'overweight',
            $bmi < 35.0  => 'obese_I',
            $bmi < 40.0  => 'obese_II',
            default      => 'obese_III',
        };
    }
}
