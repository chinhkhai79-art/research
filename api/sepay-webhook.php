<?php
date_default_timezone_set('Asia/Ho_Chi_Minh');

header('Content-Type: application/json; charset=utf-8');

$SEPAY_API_KEY = 'mysecret123';

$PAYMENT_PREFIX = 'RESEARCH';

$DATA_DIR = __DIR__ . '/../data';
$PAYMENT_FILE = $DATA_DIR . '/payments.json';
$LOG_FILE = $DATA_DIR . '/sepay-webhook.log';

if (!is_dir($DATA_DIR)) {
    mkdir($DATA_DIR, 0775, true);
}

function json_response($data, $status = 200) {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function write_log_line($message) {
    global $LOG_FILE;
    $time = date('Y-m-d H:i:s');
    file_put_contents($LOG_FILE, "[$time] $message\n", FILE_APPEND);
}

function get_authorization_header() {
    $headers = [];

    if (function_exists('getallheaders')) {
        $headers = getallheaders();
    }

    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'authorization') {
            return trim($value);
        }
    }

    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        return trim($_SERVER['HTTP_AUTHORIZATION']);
    }

    if (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        return trim($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);
    }

    return '';
}

function api_key_is_valid() {
    global $SEPAY_API_KEY;

    $auth = get_authorization_header();

    if ($auth === '') {
        return false;
    }

    $valid1 = 'Apikey ' . $SEPAY_API_KEY;
    $valid2 = 'ApiKey ' . $SEPAY_API_KEY;
    $valid3 = 'Bearer ' . $SEPAY_API_KEY;

    return hash_equals($valid1, $auth)
        || hash_equals($valid2, $auth)
        || hash_equals($valid3, $auth)
        || hash_equals($SEPAY_API_KEY, $auth);
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

function save_payments($payments) {
    global $PAYMENT_FILE;

    file_put_contents(
        $PAYMENT_FILE,
        json_encode($payments, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT),
        LOCK_EX
    );
}

function first_value($data, $keys, $default = '') {
    foreach ($keys as $key) {
        if (isset($data[$key]) && $data[$key] !== '') {
            return $data[$key];
        }
    }

    return $default;
}

function clean_amount($value) {
    if (is_numeric($value)) {
        return (int)$value;
    }

    $value = preg_replace('/[^0-9]/', '', (string)$value);
    return (int)$value;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'POST') {
    json_response([
        'success' => false,
        'message' => 'Webhook đang hoạt động. SePay cần gửi request POST JSON.'
    ], 405);
}

$rawBody = file_get_contents('php://input');
$auth = get_authorization_header();

write_log_line('AUTH: ' . $auth);
write_log_line('BODY: ' . $rawBody);

if (!api_key_is_valid()) {
    write_log_line('ERROR: Invalid API Key');
    json_response([
        'success' => false,
        'message' => 'Invalid API Key'
    ], 401);
}

$data = json_decode($rawBody, true);

if (!$rawBody || !is_array($data)) {
    write_log_line('ERROR: Invalid JSON payload');
    json_response([
        'success' => false,
        'message' => 'Invalid JSON payload'
    ], 400);
}

$transferType = strtolower(trim((string) first_value($data, [
    'transferType',
    'type',
    'transactionType'
], 'in')));

if ($transferType !== '' && !in_array($transferType, ['in', 'deposit', 'credit', 'money_in', 'receive'], true)) {
    write_log_line('SKIP: Not money in. transferType=' . $transferType);
    json_response([
        'success' => true,
        'updated' => false,
        'message' => 'Bỏ qua vì không phải giao dịch tiền vào.'
    ]);
}

$amount = clean_amount(first_value($data, [
    'transferAmount',
    'amount',
    'transaction_amount',
    'money',
    'value'
], 0));

$content = (string) first_value($data, [
    'content',
    'description',
    'transaction_content',
    'transferContent',
    'transactionContent',
    'code',
    'referenceCode',
    'reference_code'
], '');

$description = (string) first_value($data, [
    'description',
    'content',
    'transaction_content',
    'transferContent',
    'transactionContent'
], '');

$referenceCode = (string) first_value($data, [
    'referenceCode',
    'reference_code',
    'bankReferenceCode',
    'bank_reference_code'
], '');

$transactionId = (string) first_value($data, [
    'id',
    'transaction_id',
    'transactionId'
], '');

$searchText = strtoupper($content . ' ' . $description . ' ' . $referenceCode);

preg_match('/RESEARCH[0-9A-Z_-]+/i', $searchText, $matches);

$orderCode = $matches[0] ?? '';

if ($orderCode === '') {
    write_log_line('SKIP: Không tìm thấy mã RESEARCH trong nội dung. Content=' . $searchText);

    json_response([
        'success' => true,
        'updated' => false,
        'message' => 'Không tìm thấy mã thanh toán RESEARCH trong nội dung chuyển khoản.',
        'received_amount' => $amount,
        'received_content' => $content,
        'received_description' => $description
    ]);
}

$payments = load_payments();

$payments[$orderCode] = [
    'success' => true,
    'paid' => true,
    'orderCode' => $orderCode,
    'amount' => $amount,
    'paidAt' => date('c'),
    'transactionId' => $transactionId,
    'referenceCode' => $referenceCode,
    'content' => $content,
    'description' => $description,
    'raw' => $data
];

save_payments($payments);

write_log_line('SUCCESS: Paid order=' . $orderCode . '; amount=' . $amount);

json_response([
    'success' => true,
    'updated' => true,
    'message' => 'Đã ghi nhận thanh toán thành công.',
    'orderCode' => $orderCode,
    'amount' => $amount
]);
