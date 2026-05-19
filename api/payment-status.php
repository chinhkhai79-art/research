<?php
date_default_timezone_set('Asia/Ho_Chi_Minh');

header('Content-Type: application/json; charset=utf-8');

$DATA_DIR = __DIR__ . '/../data';
$PAYMENT_FILE = $DATA_DIR . '/payments.json';

function json_response($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function load_payments() {
    global $PAYMENT_FILE;

    if (!file_exists($PAYMENT_FILE)) {
        return [];
    }

    $raw = file_get_contents($PAYMENT_FILE);
    $data = json_decode($raw, true);

    return is_array($data) ? $data : [];
}

function detect_plan_from_amount($amount) {
    $amount = (int)$amount;

    if ($amount >= 500000) {
        return [
            'planId' => '12m',
            'planName' => 'Gói 1 năm',
            'days' => 365
        ];
    }

    if ($amount >= 180000) {
        return [
            'planId' => '3m',
            'planName' => 'Gói 3 tháng',
            'days' => 90
        ];
    }

    if ($amount >= 10000) {
        return [
            'planId' => '1m',
            'planName' => 'Gói 1 tháng',
            'days' => 30
        ];
    }

    return null;
}

$orderCode = strtoupper(trim($_GET['orderCode'] ?? ''));

if ($orderCode === '') {
    json_response([
        'success' => false,
        'paid' => false,
        'message' => 'Thiếu orderCode.'
    ], 400);
}

$payments = load_payments();

if (!isset($payments[$orderCode]) || empty($payments[$orderCode]['paid'])) {
    json_response([
        'success' => true,
        'paid' => false,
        'message' => 'Chưa ghi nhận thanh toán.'
    ]);
}

$payment = $payments[$orderCode];
$amount = (int)($payment['amount'] ?? 0);
$plan = detect_plan_from_amount($amount);

if (!$plan) {
    json_response([
        'success' => true,
        'paid' => false,
        'message' => 'Đã nhận giao dịch nhưng số tiền chưa đủ để kích hoạt gói.',
        'amount' => $amount
    ]);
}

$paidAt = $payment['paidAt'] ?? date('c');
$expiresAt = date('c', strtotime($paidAt . ' +' . $plan['days'] . ' days'));

json_response([
    'success' => true,
    'paid' => true,
    'orderCode' => $orderCode,
    'amount' => $amount,
    'planId' => $plan['planId'],
    'planName' => $plan['planName'],
    'paidAt' => $paidAt,
    'expiresAt' => $expiresAt
]);
