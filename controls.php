<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

define('DATA_FILE', __DIR__ . '/data.json');

function readData() {
    if (!file_exists(DATA_FILE)) {
        http_response_code(404);
        echo json_encode(['error' => 'data.json not found']);
        exit;
    }
    $content = file_get_contents(DATA_FILE);
    if ($content === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot read data file']);
        exit;
    }
    return json_decode($content, true);
}

function writeData($data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === null) {
        http_response_code(500);
        echo json_encode(['error' => 'JSON encode error: ' . json_last_error_msg()]);
        exit;
    }
    $result = file_put_contents(DATA_FILE, $json, LOCK_EX);
    if ($result === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Cannot write to data file. Check file permissions.']);
        exit;
    }
    return true;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $data = readData();
    echo json_encode($data);
    exit;
}

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);

    if ($input === null && !empty($rawInput)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON: ' . json_last_error_msg()]);
        exit;
    }

    $action = isset($input['action']) ? $input['action'] : (isset($_POST['action']) ? $_POST['action'] : '');

    if (empty($action)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing action']);
        exit;
    }

    switch ($action) {
        case 'save_raw_json': {
            $jsonStr = isset($input['json']) ? $input['json'] : '';
            if (empty($jsonStr)) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing json field']);
                exit;
            }
            $parsed = json_decode($jsonStr, true);
            if ($parsed === null) {
                http_response_code(400);
                echo json_encode(['error' => 'Invalid JSON: ' . json_last_error_msg()]);
                exit;
            }
            if (!isset($parsed['businesses']) || !is_array($parsed['businesses'])) {
                http_response_code(400);
                echo json_encode(['error' => 'JSON must contain a businesses array']);
                exit;
            }
            writeData($parsed);
            echo json_encode(['status' => 'ok']);
            break;
        }

        case 'update_business': {
            $businessId = isset($input['business_id']) ? $input['business_id'] : '';
            $businessData = isset($input['data']) ? $input['data'] : null;

            if (empty($businessId) || $businessData === null) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing business_id or data']);
                exit;
            }

            $data = readData();
            $found = false;
            foreach ($data['businesses'] as $key => $biz) {
                if ($biz['id'] === $businessId) {
                    $data['businesses'][$key] = $businessData;
                    $found = true;
                    break;
                }
            }

            if (!$found) {
                http_response_code(404);
                echo json_encode(['error' => "Business not found: $businessId"]);
                exit;
            }

            $data['businesses'] = array_values($data['businesses']);
            $data['metadata']['total_businesses'] = count($data['businesses']);
            $nepalCount = $intlCount = 0;
            foreach ($data['businesses'] as $biz) {
                if (!empty($biz['country'])) {
                    if (strcasecmp(trim($biz['country']), 'Nepal') === 0) {
                        $nepalCount++;
                    } else {
                        $intlCount++;
                    }
                }
            }
            $data['metadata']['nepal_count'] = $nepalCount;
            $data['metadata']['international_count'] = $intlCount;

            writeData($data);
            echo json_encode(['status' => 'ok']);
            break;
        }

        case 'delete_business': {
            $businessId = isset($input['business_id']) ? $input['business_id'] : '';

            if (empty($businessId)) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing business_id']);
                exit;
            }

            $data = readData();
            $before = count($data['businesses']);
            $data['businesses'] = array_values(array_filter($data['businesses'], function($biz) use ($businessId) {
                return $biz['id'] !== $businessId;
            }));

            if (count($data['businesses']) === $before) {
                http_response_code(404);
                echo json_encode(['error' => "Business not found: $businessId"]);
                exit;
            }

            $data['businesses'] = array_values($data['businesses']);
            $data['metadata']['total_businesses'] = count($data['businesses']);
            $nepalCount = $intlCount = 0;
            foreach ($data['businesses'] as $biz) {
                if (!empty($biz['country'])) {
                    if (strcasecmp(trim($biz['country']), 'Nepal') === 0) {
                        $nepalCount++;
                    } else {
                        $intlCount++;
                    }
                }
            }
            $data['metadata']['nepal_count'] = $nepalCount;
            $data['metadata']['international_count'] = $intlCount;

            writeData($data);
            echo json_encode(['status' => 'ok']);
            break;
        }

        case 'add_business': {
            $newBusiness = isset($input['data']) ? $input['data'] : null;

            if ($newBusiness === null) {
                http_response_code(400);
                echo json_encode(['error' => 'Missing business data']);
                exit;
            }

            $data = readData();

            if (!empty($newBusiness['id'])) {
                foreach ($data['businesses'] as $biz) {
                    if ($biz['id'] === $newBusiness['id']) {
                        http_response_code(409);
                        echo json_encode(['error' => 'Business ID already exists: ' . $newBusiness['id']]);
                        exit;
                    }
                }
            } else {
                $maxNum = 0;
                foreach ($data['businesses'] as $biz) {
                    if (preg_match('/^BIZ_(\d+)$/', $biz['id'], $m)) {
                        $maxNum = max($maxNum, (int)$m[1]);
                    }
                }
                $newBusiness['id'] = 'BIZ_' . str_pad($maxNum + 1, 3, '0', STR_PAD_LEFT);
            }

            $data['businesses'][] = $newBusiness;
            $data['businesses'] = array_values($data['businesses']);
            $data['metadata']['total_businesses'] = count($data['businesses']);
            $nepalCount = $intlCount = 0;
            foreach ($data['businesses'] as $biz) {
                if (!empty($biz['country'])) {
                    if (strcasecmp(trim($biz['country']), 'Nepal') === 0) {
                        $nepalCount++;
                    } else {
                        $intlCount++;
                    }
                }
            }
            $data['metadata']['nepal_count'] = $nepalCount;
            $data['metadata']['international_count'] = $intlCount;

            writeData($data);
            echo json_encode(['status' => 'ok', 'new_id' => $newBusiness['id']]);
            break;
        }

        default: {
            http_response_code(400);
            echo json_encode(['error' => "Unknown action: $action"]);
            exit;
        }
    }
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
