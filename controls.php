<?php
header('Content-Type: text/plain; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

define('DATA_FILE', __DIR__ . '/data.json');

function readData() {
    if (!file_exists(DATA_FILE)) {
        http_response_code(500);
        echo "Data file not found.";
        exit;
    }
    $content = file_get_contents(DATA_FILE);
    if ($content === false) {
        http_response_code(500);
        echo "Cannot read data file.";
        exit;
    }
    return json_decode($content, true);
}

function writeData($data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === null) {
        http_response_code(500);
        echo "JSON encode error: " . json_last_error_msg();
        exit;
    }
    $result = file_put_contents(DATA_FILE, $json);
    if ($result === false) {
        http_response_code(500);
        echo "Cannot write to data file.";
        exit;
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo "Method not allowed.";
    exit;
}

$action = isset($_POST['action']) ? $_POST['action'] : '';

switch ($action) {
    case 'update_business':
        $businessId = isset($_POST['business_id']) ? $_POST['business_id'] : '';
        $dataStr = isset($_POST['data']) ? $_POST['data'] : '';

        if (empty($businessId) || empty($dataStr)) {
            http_response_code(400);
            echo "Missing business_id or data.";
            exit;
        }

        $updated = json_decode($dataStr, true);
        if ($updated === null) {
            http_response_code(400);
            echo "Invalid JSON data: " . json_last_error_msg();
            exit;
        }

        $data = readData();
        $found = false;

        foreach ($data['businesses'] as $key => $biz) {
            if ($biz['id'] === $businessId) {
                $data['businesses'][$key] = $updated;
                $found = true;
                break;
            }
        }

        if (!$found) {
            http_response_code(404);
            echo "Business not found: $businessId";
            exit;
        }

        $data['metadata']['total_businesses'] = count($data['businesses']);
        $nepalCount = 0;
        $intlCount = 0;
        foreach ($data['businesses'] as $biz) {
            if (isset($biz['country'])) {
                if (strcasecmp($biz['country'], 'Nepal') === 0) {
                    $nepalCount++;
                } else {
                    $intlCount++;
                }
            }
        }
        $data['metadata']['nepal_count'] = $nepalCount;
        $data['metadata']['international_count'] = $intlCount;

        writeData($data);
        echo "OK";
        break;

    case 'delete_business':
        $businessId = isset($_POST['business_id']) ? $_POST['business_id'] : '';

        if (empty($businessId)) {
            http_response_code(400);
            echo "Missing business_id.";
            exit;
        }

        $data = readData();
        $initialCount = count($data['businesses']);
        $data['businesses'] = array_values(array_filter($data['businesses'], function($biz) use ($businessId) {
            return $biz['id'] !== $businessId;
        }));

        if (count($data['businesses']) === $initialCount) {
            http_response_code(404);
            echo "Business not found: $businessId";
            exit;
        }

        $data['metadata']['total_businesses'] = count($data['businesses']);
        $nepalCount = 0;
        $intlCount = 0;
        foreach ($data['businesses'] as $biz) {
            if (isset($biz['country'])) {
                if (strcasecmp($biz['country'], 'Nepal') === 0) {
                    $nepalCount++;
                } else {
                    $intlCount++;
                }
            }
        }
        $data['metadata']['nepal_count'] = $nepalCount;
        $data['metadata']['international_count'] = $intlCount;

        writeData($data);
        echo "OK";
        break;

    case 'add_business':
        $dataStr = isset($_POST['data']) ? $_POST['data'] : '';

        if (empty($dataStr)) {
            http_response_code(400);
            echo "Missing data.";
            exit;
        }

        $newBusiness = json_decode($dataStr, true);
        if ($newBusiness === null) {
            http_response_code(400);
            echo "Invalid JSON data: " . json_last_error_msg();
            exit;
        }

        $data = readData();

        $exists = false;
        foreach ($data['businesses'] as $biz) {
            if ($biz['id'] === $newBusiness['id']) {
                $exists = true;
                break;
            }
        }
        if ($exists) {
            http_response_code(409);
            echo "Business ID already exists: " . $newBusiness['id'];
            exit;
        }

        $data['businesses'][] = $newBusiness;
        $data['metadata']['total_businesses'] = count($data['businesses']);
        $nepalCount = 0;
        $intlCount = 0;
        foreach ($data['businesses'] as $biz) {
            if (isset($biz['country'])) {
                if (strcasecmp($biz['country'], 'Nepal') === 0) {
                    $nepalCount++;
                } else {
                    $intlCount++;
                }
            }
        }
        $data['metadata']['nepal_count'] = $nepalCount;
        $data['metadata']['international_count'] = $intlCount;

        writeData($data);
        echo "OK";
        break;

    case 'get_data':
        $data = readData();
        echo json_encode($data);
        break;

    default:
        http_response_code(400);
        echo "Unknown action: $action";
        exit;
}
